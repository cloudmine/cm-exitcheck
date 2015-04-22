'use strict';
function is_exit(node, function_names){
    /*
        Test whether a node represents an exit() call.
    */
    var exits = ['exit'];
    if (Array.isArray(function_names)){
        exits = exits.concat(function_names)
    }


    if (node.type === "ExpressionStatement"){
        if (node.expression.type === "CallExpression"){
            var name = node.expression.callee.name;
            for (var i = 0; i < exits.length; i++) {
                if (name === exits[i]){
                    return true;
                }
            }
        }
    }
    
    return false;
}

function nodes_equivalent(node1, node2){
    /* 
        Checks whether two nodes are equivalent by checking the range of code 
        each node covers. If the range is identical, then they are identical 
        nodes.
    */

    // range is a list with two elements
    if (node1.range[0] === node2.range[0]){
        if (node1.range[1] === node2.range[1]){
            return true;
        }
    }
    return false;
}

function combine(array1, array2){
    /*
        Combines two arrays of nodes into one array with no duplicated 
        values. 
    */

    var to_return = array1;
    for (var i = 0; i < array2.length; i++){
        var should_add = true;
        for (var j = 0; j < array1.length; j++){
            if (nodes_equivalent(array2[i], array1[j])){
                // if it exists already, don't add it
                should_add = false;
            }
        }
        if (should_add){
            to_return.push(array2[i]);
        }
    }

    return to_return;
}

function get_original_node(node, filetext){
    /*
        Quick helper for extracting code as string
    */
    return filetext.substring(node.range[0], node.range[1]);
}

function transform(node, filetext, exits){
    /*
        Transforms an esprima node into one which is easier to re-sort by test
    */
    if (typeof exits !== 'boolean'){
        exits = false;
    }
    var condition, test, cond_loc;

    if (node.parent.type === "IfStatement"){
        test = "if " + get_original_node(node.parent.test, filetext);
        cond_loc = node.parent.test.loc;
        if (nodes_equivalent(node.parent.consequent, node)){
            condition = "true";
        } else {
            condition = "false";
        }
    } else if (node.type === "SwitchCase"){
        test = "switch " + get_original_node(node.parent.discriminant, filetext);
        cond_loc = node.parent.discriminant.loc;
        if (node.test !== null){
            condition = node.test.raw;
        } else {
            condition = "default";
        }
    }

    var obj = {
        'test': test,
        'condition': condition,
        'code_loc': node.loc,
        'condition_loc': cond_loc,
        'exits': exits,
    }

    return obj;
}

function combine_by_test(exits, non_exits, filetext){
    /*
        Combines transformed nodes in an object sorted by tests.
    */
    var all = {}

    for (var i = 0; i < exits.length; i++){
        var transformed = transform(exits[i], filetext, true);
        var test = transformed.test;
        if (all[test] === undefined){
            all[test] = [transformed];
        } else {
            all[test].push(transformed);
        }
    }

    for (var i = 0; i < non_exits.length; i++){
        var transformed = transform(non_exits[i], filetext, false);
        var test = transformed.test;
        if (all[test] === undefined){
            all[test] = [transformed];
        } else {
            all[test].push(transformed);
        }
    }

    return all;
}

function reformat(all){
    /*
        Reformats a list of transformed nodes into an object
    */
    var to_return = {}

    for (var key in all){
        var obj = {}
        if (/^if/.exec(key)){
            obj.type = "if";

            // because there might not be an "else" to this "if"
            obj.false = null;

            for (var i = 0; i < all[key].length; i++){
                var node = all[key][i];
                if (node.condition === "true"){
                    obj.true = {
                        'loc': node.code_loc,
                        'exits': node.exits,
                    }
                    obj.loc = node.condition_loc;
                } else if (node.condition === "false"){
                    obj.false = {
                        'loc': node.code_loc,
                        'exits': node.exits,
                    }
                }
            }
        } else if (/^switch/.exec(key)){
            obj.type = "switch";
            obj.cases = [];
            obj.loc = all[key][0].condition_loc;
            for (var i = 0; i < all[key].length; i++){
                var snode = all[key][i];
                obj.cases.push({
                    'case': node.condition,
                    'loc': node.code_loc,
                    'exits': node.exits,
                });
            }
        }

        to_return[key] = obj;
    }

    return to_return;
}

function extract_nodes(node){
    /*
        Extracts the relevant child nodes. 
        - For an if statement, this means the if and all else/else if blocks. 
        - For a switch statement, this means all cases.
    */
    var nodes = [];

    if (node.type === "IfStatement"){
        nodes.push(node.consequent);
        if (node.alternate !== null && node.alternate !== undefined){ 
            // there is an "else" to this "if"
            var else_type = node.alternate.type;
            if (else_type === "IfStatement"){
                // it's an "else if" actually, so its siblings are ours too
                var ifs = extract_nodes(node.alternate);
                nodes = nodes.concat(ifs);
            } else {
                nodes.push(node.alternate);
            }
        }
    }

    if (node.type === "SwitchStatement"){
        nodes = node.cases;
    }

    return nodes;
}

function sort(parent, exiting_functions){
    /*
        Returns an object of all of a node's children, sorted based on whether 
        they exit. Nodes that exit are in the 'exit' property; nodes that do not are in the 'non_exits' property.
    */
    var nodes = extract_nodes(parent);
    var exits = [];
    var non_exits = [];

    for (var i = 0; i < nodes.length; i++){
        var node = nodes[i];
        node.parent = parent;
        var exited = false;

        if (node.type === "BlockStatement"){
            for (var j = 0; j < node.body.length; j++){
                if (node.body[j].type === "ExpressionStatement"){
                    if (is_exit(node.body[j], exiting_functions)){
                        exited = true;
                        break;
                    }
                }
            }
        } else {
            if (node.type === "ExpressionStatement"){
                if (is_exit(node, exiting_functions)){
                    exited = true;
                }
            }
            if (node.type === "SwitchCase"){
                var consequent = node.consequent;
                for (var j = 0; j < consequent.length; j++){
                    if (is_exit(consequent[j], exiting_functions)){
                        exited = true;
                        break;
                    }
                }
            }
        }

        if (exited){
            exits.push(node);
        } else {
            non_exits.push(node);
        }
    }

    return {
        'exits': exits,
        'non_exits': non_exits,
    }
}

function check_functions(program){
    var exiting = [];

    if (program.type === "Program"){
        for (var i = 0; i < program.body.length; i++) {
            var node = program.body[i];
            if (node.type === 'FunctionDeclaration'){
                var actual_body = node.body.body
                for (var j = 0; j < actual_body.length; j++) {
                    if (is_exit(actual_body[j])){
                        exiting.push(node.id.name);
                    }
                }
            }
        }
    }

    return exiting;
}

module.exports = {
    'is_exit': is_exit,
    'nodes_equivalent': nodes_equivalent,
    'combine': combine,
    'get_original_node': get_original_node,
    'transform': transform,
    'combine_by_test': combine_by_test,
    'reformat': reformat,
    'sort': sort,
    'check_functions': check_functions,
}
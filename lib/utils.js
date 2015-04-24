'use strict';
function is_exit(node, function_names){
    /*
        Test whether a node represents an exit() call.
    */
    var exits = ['exit'];
    if (Array.isArray(function_names)){
        exits = exits.concat(function_names)
    }


    if (node.type === 'ExpressionStatement'){
        if (node.expression.type === 'CallExpression'){
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
    if (node1.range){
        if (node1.range[0] === node2.range[0]){
            if (node1.range[1] === node2.range[1]){
                return true;
            }
        }
    }
    return false;
}

function get_original_node(node, filetext){
    /*
        Quick helper for extracting code as string
    */
    return filetext.substring(node.range[0], node.range[1]);
}

function add_condition(block, condition){
    /*
        Adds a condition to a block and its children if relevant.
    */
    if (block.type === 'BlockStatement' || block.type === 'ForStatment'){
        for (var i = 0; i < block.body.length; i++) {
            block.body[i].condition = condition;
        }
    }

    block.condition = condition;
}

function extract_nodes(node, filetext){
    /*
        Extracts the relevant child nodes and adds the relevant condition.
        - For an if statement, returns the if and else blocks.
        - For a switch statement, returns all cases.
    */
    var nodes = [];

    if (node.type === 'IfStatement'){
        var test;
        if (node.condition){
            test = node.condition + ' and ';
        } else{
            test = 'if '
        }
        test += get_original_node(node.test, filetext);

        add_condition(node.consequent, test + ' is true');
        nodes.push(node.consequent);


        if (node.alternate){
            add_condition(node.alternate, test + ' is false');
            if (node.alternate.type !== 'IfStatement' && node.alternate.type !== 'SwitchStatement'){
                // so we don't duplicate things we are seeing later
                nodes.push(node.alternate);
            }
        }
    } else if (node.type === 'SwitchStatement'){
        nodes = node.cases;
        var test = 'if ' + get_original_node(node.discriminant, filetext);
        for (var i = 0; i < node.cases.length; i++) {
            if (node.cases[i].test !== null){
                var this_test = get_original_node(node.cases[i].test, filetext);
                add_condition(node.cases[i], test + ' is ' + this_test);
            } else{
                add_condition(node.cases[i], test + ' falls through to default');
            }
        }
    }

    for (var i = 0; i < nodes.length; i++) {
        nodes[i].parent = node;
    }

    return nodes;
}

function sort(parent, exiting_functions, filetext){
    /*
        Returns an object of all of a node's children, sorted based on whether 
        they exit. Nodes that exit are in the 'exit' property; nodes that do not are in the 'non_exits' property.
    */
    var nodes = extract_nodes(parent, filetext);
    var exits = [];
    var non_exits = [];

    for (var i = 0; i < nodes.length; i++){
        var node = nodes[i];
        var exited = false;

        if (node.type === 'BlockStatement'){
            for (var j = 0; j < node.body.length; j++){
                if (node.body[j].type === 'ExpressionStatement'){
                    if (is_exit(node.body[j], exiting_functions)){
                        exited = true;
                        break;
                    }
                }
            }
        } else {
            if (node.type === 'ExpressionStatement'){
                if (is_exit(node, exiting_functions)){
                    exited = true;
                }
            }
            if (node.type === 'SwitchCase'){
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

    if (program.type === 'Program'){
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
    'sort': sort,
    'check_functions': check_functions,
}
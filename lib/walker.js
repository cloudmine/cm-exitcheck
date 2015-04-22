var utils = require('./utils');

function walk_node(node, syntax){
    /*
        This function was adapted from the defaultWalker function in the 
        "istanbul" npm module (istanbul/lib/instrumenter.js).
    */
    if (syntax === undefined||syntax === null){
        syntax = init_syntax();
    }
    var children_properties = syntax[node.type].children;
    var all_nodes = [];

    if (children_properties.length){
        for (var i = 0; i < children_properties.length; i += 1){
            var childType = children_properties[i];
            var childNode = node[childType];
            if (childNode !== null){
                if (Array.isArray(childNode)){
                    for (var j = 0; j < childNode.length; j += 1){
                        var childElement = childNode[j];
                        if (childElement){
                            var sorted = utils.sort(childElement);
                            if (sorted.exits.length || sorted.non_exits.length){
                                all_nodes = all_nodes.concat(sorted);
                            }
                            all_nodes = all_nodes.concat(walk_node(childElement));
                        }
                    }
                } else {
                    var sorted = utils.sort(childNode);
                    if (sorted.exits.length || sorted.non_exits.length){
                        all_nodes = all_nodes.concat(sorted);
                    }
                    all_nodes = all_nodes.concat(walk_node(childNode));
                }
            }
        }
    }
    return all_nodes;
}

function init_syntax(){
    /*
     * SYNTAX and the for loop to improve it are taken directly from "istanbul"
     * npm module (istanbul/lib/instrumenter.js 68-147).
    */

    var syntax = {
        // keep in sync with estraverse's VisitorKeys
        AssignmentExpression: ['left', 'right'],
        AssignmentPattern: ['left', 'right'],
        ArrayExpression: ['elements'],
        ArrayPattern: ['elements'],
        ArrowFunctionExpression: ['params', 'body'],
        AwaitExpression: ['argument'], // CAUTION: It's deferred to ES7.
        BlockStatement: ['body'],
        BinaryExpression: ['left', 'right'],
        BreakStatement: ['label'],
        CallExpression: ['callee', 'arguments'],
        CatchClause: ['param', 'body'],
        ClassBody: ['body'],
        ClassDeclaration: ['id', 'superClass', 'body'],
        ClassExpression: ['id', 'superClass', 'body'],
        ComprehensionBlock: ['left', 'right'],  // CAUTION: It's deferred to ES7.
        ComprehensionExpression: ['blocks', 'filter', 'body'],  // CAUTION: It's deferred to ES7.
        ConditionalExpression: ['test', 'consequent', 'alternate'],
        ContinueStatement: ['label'],
        DebuggerStatement: [],
        DirectiveStatement: [],
        DoWhileStatement: ['body', 'test'],
        EmptyStatement: [],
        ExportAllDeclaration: ['source'],
        ExportDefaultDeclaration: ['declaration'],
        ExportNamedDeclaration: ['declaration', 'specifiers', 'source'],
        ExportSpecifier: ['exported', 'local'],
        ExpressionStatement: ['expression'],
        ForStatement: ['init', 'test', 'update', 'body'],
        ForInStatement: ['left', 'right', 'body'],
        ForOfStatement: ['left', 'right', 'body'],
        FunctionDeclaration: ['id', 'params', 'body'],
        FunctionExpression: ['id', 'params', 'body'],
        GeneratorExpression: ['blocks', 'filter', 'body'],  // CAUTION: It's deferred to ES7.
        Identifier: [],
        IfStatement: ['test', 'consequent', 'alternate'],
        ImportDeclaration: ['specifiers', 'source'],
        ImportDefaultSpecifier: ['local'],
        ImportNamespaceSpecifier: ['local'],
        ImportSpecifier: ['imported', 'local'],
        Literal: [],
        LabeledStatement: ['label', 'body'],
        LogicalExpression: ['left', 'right'],
        MemberExpression: ['object', 'property'],
        MethodDefinition: ['key', 'value'],
        ModuleSpecifier: [],
        NewExpression: ['callee', 'arguments'],
        ObjectExpression: ['properties'],
        ObjectPattern: ['properties'],
        Program: ['body'],
        Property: ['key', 'value'],
        RestElement: [ 'argument' ],
        ReturnStatement: ['argument'],
        SequenceExpression: ['expressions'],
        SpreadElement: ['argument'],
        SuperExpression: ['super'],
        SwitchStatement: ['discriminant', 'cases'],
        SwitchCase: ['test', 'consequent'],
        TaggedTemplateExpression: ['tag', 'quasi'],
        TemplateElement: [],
        TemplateLiteral: ['quasis', 'expressions'],
        ThisExpression: [],
        ThrowStatement: ['argument'],
        TryStatement: ['block', 'handler', 'finalizer'],
        UnaryExpression: ['argument'],
        UpdateExpression: ['argument'],
        VariableDeclaration: ['declarations'],
        VariableDeclarator: ['id', 'init'],
        WhileStatement: ['test', 'body'],
        WithStatement: ['object', 'body'],
        YieldExpression: ['argument']
    }

    for (var nodeType in syntax){
        /* istanbul ignore else: has own property */
        if (syntax.hasOwnProperty(nodeType)){
            syntax[nodeType] = { name: nodeType, children: syntax[nodeType] };
        }
    }

    return syntax;
}

module.exports = {
    'walk': walk_node,
    'syntax': init_syntax
}
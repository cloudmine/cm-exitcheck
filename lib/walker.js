'use strict';

function init_syntax(){
  /*
    Initializes a helper object for iterating over esprima nodes.

    The `syntax` variable and the for loop to modify it are taken directly 
    from `istanbul` npm module (istanbul/lib/instrumenter.js).

    @return: an object with a key for each esprima node type
      the value of each key is an object with `type` equal to the key and 
      `children` which allows us to extract the relevant sub-nodes from each 
      esprima node
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
  };

  for (var nodeType in syntax){
    /* istanbul ignore else: has own property */
    if (syntax.hasOwnProperty(nodeType)){
      syntax[nodeType] = { name: nodeType, children: syntax[nodeType] };
    }
  }

  return syntax;
}

function walk_node(node, parser, syntax){
  /*
    Recursively walks all children of `node` and processes them with `parser`.

    This function was adapted from the defaultWalker function in the 
    'istanbul' npm module (istanbul/lib/instrumenter.js).

    @param node: any esprima node
    @param parser: a function used to parse each node
      should return a falsy value iff nothing relevant found
    @param syntax: an optional object of node types and their relevant 
      children; see init_syntax above for example and formatting

    @return: an array of results parsed by parser
  */
  if (!(syntax)){
    // it is, in fact, terribly important, if optional
    syntax = init_syntax();
  }
  var children_properties = syntax[node.type].children;
  var all_nodes = [];

  if (children_properties.length){
    // FunctionExpression nodes are tested in callback.js
    for (var i = 0; i < children_properties.length; i += 1){
      var childType = children_properties[i];
      var childNode = node[childType];
      if (childNode !== null){
        if (Array.isArray(childNode)){
          for (var j = 0; j < childNode.length; j += 1){
            var childElement = childNode[j];
            if (childElement){
              var parsed_element = parser(childElement);
              if (parsed_element){
                all_nodes.push(parsed_element);
              }
              all_nodes = all_nodes.concat(walk_node(childElement, parser, syntax));
            }
          }
        } else {
          var parsed_child = parser(childNode);
          if (parsed_child){
            all_nodes.push(parsed_child);
          }
          all_nodes = all_nodes.concat(walk_node(childNode, parser, syntax));
        }
      }
    }
  }

  return all_nodes;
}

module.exports = {
  'walk': walk_node,
  'syntax': init_syntax
};

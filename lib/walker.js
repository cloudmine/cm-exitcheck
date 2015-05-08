'use strict';
var utils = require('./utils');

function init_syntax(){
   /*
      Initializes an object for iterating over esprima nodes.

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

function walk_node(node, code, syntax, exit_funcs){
   /*
      Recursively walks all children of `node` looking for exit calls.

      This function was adapted from the defaultWalker function in the 
      'istanbul' npm module (istanbul/lib/instrumenter.js).

      @param node: any esprima node
      @param code: the complete text from which `node` was parsed
      @param syntax: an optional object of node types and their relevant 
         children; see init_syntax above for example and formatting
      @param exit_funcs: an optional array of names of functions which call exit

      @return: an array of objects each with the following properties:
         `exits`: those nodes that successfully exit
         `non_exits`: nodes related to the previous that do not exit
   */
   if (!(syntax)){
      syntax = init_syntax();
   }
   var children_properties = syntax[node.type].children;
   var all_nodes = [];

   if (children_properties.length && node.type !== 'FunctionExpression'){
      // FunctionExpression nodes are tested in callback.js
      for (var i = 0; i < children_properties.length; i += 1){
         var childType = children_properties[i];
         var childNode = node[childType];
         if (childNode !== null){
            if (Array.isArray(childNode)){
               for (var j = 0; j < childNode.length; j += 1){
                  var childElement = childNode[j];
                  if (childElement){
                     var sorted_element = utils.sort(childElement, exit_funcs, code);
                     if (sorted_element.exits.length || sorted_element.non_exits.length){
                        all_nodes.push(sorted_element);
                     }
                     all_nodes = all_nodes.concat(walk_node(childElement, code, syntax, exit_funcs));
                  }
               }
            } else {
               var sorted_child = utils.sort(childNode, exit_funcs, code);
               if (sorted_child.exits.length || sorted_child.non_exits.length){
                  all_nodes.push(sorted_child);
               }
               all_nodes = all_nodes.concat(walk_node(childNode, code, syntax, childNode));
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
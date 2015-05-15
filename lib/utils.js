'use strict';

function handle_call(call, exits){
   /*
      Tests whether a specific function call is an exit call or one to an 
      exiting function.

      @param call: an esprima node representing a function call
      @param exits: an array of names of exiting functions

      @return: a bool of whether the call is to exit or an exiting function
   */
   if (call.type === 'CallExpression'){
      if (is_exit(call.callee, exits)){
         return true;
      }
      var name = call.callee.name;
      for (var i = 0; i < exits.length; i++) {
         if (name === exits[i]){
            return true;
         }
      }
   }

   return false;
}

function is_exit(node, function_names){
   /*
      Tests whether a node represents an exit call.

      @param node: an esprima-parsed node
      @param function_names: an optional array of names of functions which call 
         exit in their body

      @return: a bool of whether the node represents an exit call
   */
   var exits = ['exit'];
   if (Array.isArray(function_names)){
      exits = exits.concat(function_names);
   }

   switch(node.type){
      case 'ExpressionStatement':
         return handle_call(node.expression, exits);
      case 'MemberExpression':
         return handle_call(node.object, exits);
      case 'VariableDeclaration':
         for (var i = node.declarations.length - 1; i >= 0; i--) {
            var init = node.declarations[i].init;
            if (init && is_exit(init)){
               return true;
            }
         }
         break;
      case 'CallExpression':
         return handle_call(node, exits);
      case 'ReturnStatement':
         return is_exit(node.argument);
      case 'Identifier':
         for (var i = exits.length - 1; i >= 0; i--) {
            var temp_exit = {
               'type': 'Identifier',
               'name': exits[i],
            };
            if (vars_equiv(node, temp_exit)){
               return true;
            }
         }
   }

   return false;
}

function has_exit(node, function_names){
   /*
      Checks function bodies for an exit call.

      @param node: an esprima node with `body` property or an array of esprima 
         nodes
      @param function_names: an array of names of functions that always exit

      @return: a bool of whether `node` always exits
   */
   var actual_body = [];
   if (node && node.body){
      actual_body = node.body;
      if (actual_body.body){
         actual_body = actual_body.body;
      }
   }
   for (var i = 0; i < actual_body.length; i++) {
      if (is_exit(actual_body[i], function_names)){
         return true;
      }
   }

   return false;
}

function nodes_equal(node1, node2){
   /* 
      Checks whether two nodes are equal by comparing the range of code each node covers.

      @param node1: an esprima node with range property
      @param node2: an esprima node with range property

      @return: a bool of whether the nodes are equal
   */

   // range is an array with two elements
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
      Quick helper for extracting code as string.

      @param node: an esprima node with range property
      @param filetext: the string of the complete code from which `node` was 
         parsed

      @return: a string of the original code
   */
   return filetext.substring(node.range[0], node.range[1]);
}

function check_functions(node, exits){
   /*
      Extracts all functions which always exit.

      Used to handle the "wrapped exit call" case.

      @param node: an esprima node with `body` property that is an array
      @param exits: any functions already identified as exiting

      @return: an array of those functions which always exit
   */
   var exiting = [];
   if (node && Array.isArray(node.body)){
      for (var i = 0; i < node.body.length; i++) {
         var child = node.body[i];
         if (child.type === 'FunctionDeclaration'){
            var actual_body = child.body.body;
            for (var j = 0; j < actual_body.length; j++) {
               if (is_exit(actual_body[j], exits)){
                  exiting.push(child.id.name);
               }
            }
         }
      }
   }

   return exiting;
}

function vars_equiv(var1, var2){
   /*
      Checks whether two esprima variable nodes represent the same variable.

      @param var1: an esprima node for a variable
      @param var2: an esprima node for a variable

      @return: boolean of whether `var1` and `var2` represent the same variable
   */
   if (var1 && var2){
      if (var1.type === var2.type && var1.name === var2.name){
         return true;
      }
   }
   return false;
}

function get_all_functions(expr){
   /*
      Separates chained functions into an array rather than the esprima format

      @param expr: an esprima node representing a function call

      @return: an array of esprima nodes each representing a fcn call on a 
         previous fcn, ordered the way they were called (i.e. original call in 
         index 0, fcn called on the result of that in index 1, etc)
   */
   var funcs = [];
   if (expr.type === 'CallExpression'){
      if (expr.callee.type === 'CallExpression' || expr.callee.type === 'MemberExpression'){
         funcs = get_all_functions(expr.callee);

         var prop = {
            'property': expr.callee.property,
            'arguments': expr.arguments,
         };

         funcs.push(prop);
      } else{
         funcs.push(expr.callee);
      }
   } else if (expr.type === 'MemberExpression'){
      if (expr.object.type === 'CallExpression' || expr.object.type === 'MemberExpression'){
         funcs = get_all_functions(expr.object);
      } else{
         funcs.push(expr.object);
      }
   }

   return funcs;
}

function get_first_function(expr){
   /*
      Gets the first function call out of chained function calls

      ex. for `one().two().three().(...)` returns the node representing `one`

      @param expr: an esprima node representing a function call

      @return: an esprima node representing the first of chained function calls
   */
   var all = get_all_functions(expr);
   if (all.length){
      return all[0];
   }
}

function block_exits(node, function_names){
   /*
      Parses a node for exits.
      @param node: an esprima node 
      @param function_names: an array of names of exiting functions
      @return: a boolean of whether the code in question exits
   */
   if (node.body !== undefined || Array.isArray(node)){
      return has_exit(node, function_names);
   } else{
      return is_exit(node, function_names);
   }
}

function test_if(if_statement, err, exits){
   /*
      Determines whether an if statement represents error handling and whether 
      it exits.

      @param if_statement: an esprima node representing an if statement
      @param err: an esprima node representing the error parameter
      @param exits: an array of names of exiting functions

      @return: an object with the following properties:
         `err_exits`: whether the node exits
         `err_caught`: whether the node represents error handling
   */
   var test = if_statement.test;
   var consequent = if_statement.consequent;

   var undef = {
      'type': 'Identifier',
      'name': 'undefined',
   };

   var err_caught = false;
   var err_exits = false;

   if (vars_equiv(err, test)){
      err_caught = true;
      // if ([err])
      err_exits = block_exits(consequent, exits);
   } else if (test && test.type === 'BinaryExpression'){
      if (test.operator === '!='){
         if (vars_equiv(test.left, err) && vars_equiv(undef, test.right)){
            // if ([err] != undefined)
            err_caught = true;
            err_exits = block_exits(consequent, exits);
         } else if (vars_equiv(test.left, undef) && vars_equiv(err, test.right)){
            // if (undefined != [err])
            err_caught = true;
            err_exits = block_exits(consequent, exits);
         }
      } else if (test.operator === '!=='){
         if (vars_equiv(test.left, err) && vars_equiv(undef, test.right)){
            // if ([err] !== undefined)
            err_caught = true;
            err_exits = block_exits(consequent, exits);
         } else if (vars_equiv(test.left, undef) && vars_equiv(err, test.right)){
            // if (undefined !== [err])
            err_caught = true;
            err_exits = block_exits(consequent, exits);
         }

      }
   }

   return {
      'err_exits': err_exits,
      'err_caught': err_caught,
   };
}

module.exports = {
   'has_exit': has_exit,
   'is_exit': is_exit,
   'nodes_equal': nodes_equal,
   'check_functions': check_functions,
   'variables_equivalent': vars_equiv,
   'get_original_node': get_original_node,
   'get_first_function': get_first_function,
   'get_all_functions': get_all_functions,
   'test_if': test_if,
};
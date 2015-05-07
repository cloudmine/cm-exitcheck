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
      exits = exits.concat(function_names)
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
      case 'CallExpression':
         return handle_call(node, exits);
      case 'ReturnStatement':
         return is_exit(node.argument);
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
      if (is_exit(actual_body[i])){
         return true;
      }
   }

   return false;
}

function exits(node, function_names){
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

function add_condition(block, condition){
   /*
      Adds a condition to a block and its children if relevant.

      @param block: an esprima node
      @param condition: a string to set as condition property
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

      @param node: an esprima node
      @param filetext: the string of the complete code from which `node` was 
         parsed

      @return: a list of all relevant child nodes each with an additional 
         `condition` property, a readable string of the truth values required 
         to reach the node
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
      Get all of a node's children, sorted based on whether they exit. 

      @param parent: an esprima node
      @param exiting_functions: an array of names of functions that exit
      @param filetext: the string of the complete code from which `parent` was 
         parsed

      @return: an object with the following properties:
         `exits`: those nodes that exit
         `non_exits`: those nodes that do not exit
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

function check_functions(node, exits){
   /*
      Extracts all functions which always exit.

      Used to handle the "wrapped exit call" case.

      @param node: an esprima node with `body` property that is an array
      @param exits: any functions already identified as exiting

      @return: an array of those functions which always exit
   */
   var exiting = [];
   if (Array.isArray(node.body)){
      for (var i = 0; i < node.body.length; i++) {
         var child = node.body[i];
         if (child.type === 'FunctionDeclaration'){
            var actual_body = child.body.body
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

function variables_equivalent(var1, var2){
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

module.exports = {
   'has_exit': has_exit,
   'is_exit': is_exit,
   'exits': exits,
   'nodes_equal': nodes_equal,
   'sort': sort,
   'check_functions': check_functions,
   'variables_equivalent': variables_equivalent,
}
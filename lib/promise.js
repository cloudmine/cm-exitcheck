var esprima = require('esprima');
var fs = require('fs');
var utils = require('./utils.js');

function get_qs(node){
   /*
      Get all variables representing the `q` library.

      @param node: any esprima node with a `body` property

      @return: the names of the variables representing the `q` library
   */
   var vars = [];
   for (var i = 0; i < node.body.length; i++) {
      var block = node.body[i];
      if (block.type === 'VariableDeclaration'){
         for (var j = 0; j < block.declarations.length; j++) {
            if (block.declarations[j].init.type === 'CallExpression'){
               var callee = block.declarations[j].init.callee;
               if (callee.type === 'Identifier' && callee.name === 'require'){
                  var first_arg = block.declarations[j].init.arguments[0];
                  if (first_arg.type === 'Literal' && first_arg.value === 'q'){
                     vars.push(block.declarations[j].id);
                  }
               }
            }
         }
      }
   }

   return vars;
}

function variables_equal(var1, var2){
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

function is_defer(q_vars, callee){
   /*
      Checks whether a call represents q.defer

      @param q_vars: an array of variables for the `q` library
      @param callee: an esprima node for a function call

      @return: a bool of whether `callee` represents q.defer
   */
   var defer_var = {
      'type': 'Identifier',
      'name': 'defer',
   }
   for (var i = 0; i < q_vars.length; i++) {
      if (variables_equal(q_vars[i], callee.object)){
         if (variables_equal(callee.property, defer_var)){
            return true;
         }
      }
   }

   return false;
}

function is_promise(defer_var, argument){
   /*
      Checks whether a return value is a promise

      @param defer_var: an esprima node representing a q.defer call
      @param argument: an esprima node for the argument of a return function

      @return: a bool of whether `argument` is a promise
   */
   var promise_var = {
      'type': 'Identifier',
      'name': 'promise',
   }

   if (variables_equal(argument.object, defer_var)){
      if (variables_equal(argument.property, promise_var)){
         return true;
      }
   }

   return false;
}

function returns_promise(node, q_vars){
   /*
      Checks whether a function returns a promise

      @param node: an esprima node for a function call's body
      @param q_vars: an array of variables for the `q` library

      @return: a boolean of whether `node` is a function returning a promise
   */
   var defer;

   for (var i = 0; i < node.body.length; i++) {
      if (node.body[i].type === 'VariableDeclaration'){
         for (var j = 0; j < node.body[i].declarations.length; j++) {
            var callee = node.body[i].declarations[j].init.callee;
            if (is_defer(q_vars, callee)){
               defer = node.body[i].declarations[j].id;
            }
         }
      }
      if (defer && node.body[i].type === 'ReturnStatement'){
         if (is_promise(defer, node.body[i].argument)){
            return true;
         }
      }
   }

   return false;
}

function check_function_decs(node, q_vars){
   /*
      Checks all functions in a program for those which return promises

      @param node: an esprima node representing an entire program (or other 
         block with function delarations)
      @param q_vars: an array of those variables which (at program level) 
         represent the `q` library
   */
   var funcs = [];

   for (var i = 0; i < node.body.length; i++) {
      var block = node.body[i];
      if (block.type === 'FunctionDeclaration'){
         var local_qs = q_vars.concat(get_qs(block.body));
         if (returns_promise(block.body, local_qs)){
            funcs.push(block.id);
         }
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
   } else{
      return null;
   }
}

function get_all_functions(expr){
   /*
      Separates chained functions into an array rather than the esprima format

      @param expr: an esprima node representing a function call

      @return: an array of esprima nodes each representing a function call on a 
         previous function, ordered the way they were called (i.e. original 
         call in index 0, function called on the result of that in index 1, etc)
   */
   var funcs = [];
   if (expr.type === 'CallExpression'){
      if (expr.callee.type === 'CallExpression' || expr.callee.type === 'MemberExpression'){
         funcs = get_all_functions(expr.callee);
         var prop = {
            'property': expr.callee.property,
            'arguments': expr.arguments,
         }
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

function is_then(node){
   /*
      Checks whether a node represents a "promise.then" call.

      @param node: any esprima node

      @return: a boolean of whether `node` is a "promise.then" call
   */
   var then = {
      'type': 'Identifier',
      'name': 'then',
   }
   var spread = {
      'type': 'Identifier',
      'name': 'spread'
   }
   return (variables_equal(then, node) || variables_equal(spread, node));
}

function is_catch(node){
   /*
      Checks whether a node represents a "promise.catch" call.

      @param node: any esprima node

      @return: a boolean of whether `node` is a "promise.catch" call
   */
   var catch_var = {
      'type': 'Identifier',
      'name': 'catch',
   };
   var fail = {
      'type': 'Identifier',
      'name': 'fail',
   }

   return (variables_equal(catch_var, node) || variables_equal(fail, node));
}

function is_finally(node){
   /*
      Checks whether a node represents a "promise.finally" call.

      @param node: any esprima node

      @return: a boolean of whether `node` is a "promise.finally" call
   */
   var finally_var = {
      'type': 'Identifier',
      'name': 'finally',
   };
   var fin = {
      'type': 'Identifier',
      'name': 'fin',
   };

   return (variables_equal(finally_var, node) || variables_equal(fin, node));
}

function is_done(node){
   /*
      Checks whether a node represents a "promise.done" call.

      @param node: any esprima node

      @return: a boolean of whether `node` is a "promise.done" call
   */
   var done = {
      'type': 'Identifier',
      'name': 'done'
   };
   return (variables_equal(done, node));
}

function is_promise_method(node){
   /*
      Checks whether node represents any kind of promise method.

      @param node: any esprima node

      @return: a boolean of whether `node` represents any kind of promise method
   */
   return is_then(node) || is_catch(node) || is_finally(node) || is_done(node);
}

function function_is_exit(fcn){
   /*
      Checks whether a function exits.

      @param fcn: an esprima node representing a function declaration

      @return: a boolean of whether `fcn` contains an exit call
   */
   for (var i = 0; i < fcn.body.body.length; i++) {
      if (utils.is_exit(fcn.body.body[i])){
         return true;
      }
   }
   return false;
}

function parse_done(arguments, test){
   /*
      Tests "promise.done" function calls for when they exit.

      @param arguments: an array of arguments for the "done" call
      @param test: an object representing what conditions to test

      @return: an object with the following properties:
         `test`: the potentially modified version of `test`
         `run_exits`: a boolean of whether the code to run exits
         `catch_exits`: a boolean of whether the error-handling code exits
            will be undefined if there is no error-handling function
   */
   var run_exits;
   var catch_exits;
   if (test.done){
      for (var j = 0; j < arguments.length; j++) {
         switch(j){
            case 0:
               if (test.then){
                  if (function_is_exit(arguments[j])){
                     test.then = false;
                     test.fin = false;
                     run_exits = true;
                  } else{
                     run_exits = false;
                  }
               }
               break;
            case 1:
               if (test.catch){
                  if (function_is_exit(arguments[j])){
                     tests.catch = false;
                     catch_exits = true;
                  } else{
                     catch_exits = false;
                  }
               }
               break;
         }
      }
      test.done = false;
   }

   return {
      'test':test,
      'run_exits': run_exits,
      'catch_exits': catch_exits,
   }
}

function parse_catch(arguments, test){
   /*
      Tests "promise.catch" function calls for when they exit.

      @param arguments: an array of arguments for the "catch" call
      @param test: an object representing what conditions to test

      @return: an object with the following properties:
         `test`: the potentially modified version of `test`
         `catch_exits`: a boolean of whether the error-handling code exits
   */
   var exits = false;
   if (test.catch){
      if (function_is_exit(arguments[0])){
         test.catch = false;
         exits = true;
      }
   }
   return {
      'test': test,
      'catch_exits': exits,
   }
}

function parse_fin(arguments, test){
   /*
      Tests "promise.finally" function calls for when they exit.

      @param arguments: an array of arguments for the "finally" call
      @param test: an object representing what conditions to test

      @return: an object with the following properties:
         `test`: the potentially modified version of `test`
         `run_exits`: a boolean of whether the code to run exits
         `catch_exits`: a boolean of whether the error-handling code exits
            will be undefined if there is no error-handling function
   */
   var run_exits;
   var catch_exits;
   if (test.fin){
      for (var j = 0; j < arguments.length; j++) {
         switch(j){
            case 0:
               if (test.then){
                  if (function_is_exit(arguments[j])){
                     test.then = false;
                     test.fin = false;
                     run_exits = true;
                  } else{
                     run_exits = false;
                  }
               }
               break;
            case 1:
               if (test.catch){
                  if (function_is_exit(arguments[j])){
                     test.catch = false;
                     catch_exits = true;
                  } else{
                     catch_exits = false;
                  }
               }
               break;
         }
      }
   }
   
   return {
      'test':test,
      'run_exits': run_exits,
      'catch_exits': catch_exits,
   }
}

function parse_then(arguments, test){
   /*
      Tests "promise.then" function calls for when they exit.

      @param arguments: an array of arguments for the "then" call
      @param test: an object representing what conditions to test

      @return: an object with the following properties:
         `test`: the potentially modified version of `test`
         `run_exits`: a boolean of whether the code to run exits
         `catch_exits`: a boolean of whether the error-handling code exits
            will be undefined if there is no error-handling function
   */
   var run_exits;
   var catch_exits;  
   for (var j = 0; j < arguments.length; j++) {
      switch(j){
         case 0:
            if (test.then){
               if (function_is_exit(arguments[j])){
                  test.then = false;
                  test.fin = false;
                  run_exits = true;
               } else{
                  run_exits = false;
               }
            }
            break;
         case 1:
            if (test.catch){
               if (function_is_exit(arguments[j])){
                  test.catch = false;
                  catch_exits = true;
               } else{
                  catch_exits = false;
               }
            }
            break;
      }
   } 
   
   return {
      'test':test,
      'run_exits': run_exits,
      'catch_exits': catch_exits,
   }
}

function parse_promise_methods(promise){
   /*
      Determines whether promise methods successfully exit.

      @param promise: an esprima node representing a promise function

      @return: an object with the following properties:
         `all_funcs`: an array of function calls from get_all_functions
         `last_caught_index`: the highest index (of `all_funcs`) at which 
            errors are caught (0 if none caught)
         `last_caught_exit_index`: the highest index (of `all_funcs`) at which 
            errors are caught and exited (0 if none exit)
         `last_run_index`: the highest index (of `all_funcs`) where code is run
         `last_run_exit_index`: the highest index (of `all_funcs`) where code 
            that exits is run
   */
   var test = {
      'then': true,
      'catch': true,
      'fin': true,
      'done': true
   }

   var nodes = {
      'run': [],
      'catch': []
   }

   var all_funcs = get_all_functions(promise.expression);

   function parse(promise){
      /*
         Parses all kinds of promises and updates `test` as appropriate.

         @param promise: an esprima node representing a function call

         @return: if `promise` was actually a promise function, an object with the following properties:
            `catch_exits`: whether the error-handling function of `promise` 
               exits
            `run_exits`: whether the code run for `promise` exits
            `type`: a string of the type of promise call
      */
      var result;
      var type;
      if (is_done(promise.property)){
         result = parse_done(promise.arguments, test);
         type = 'done';
      } else if (is_catch(promise.property)){
         result =  parse_catch(promise.arguments, test);
         type = 'catch';
      } else if (is_finally(promise.property)){
         result =  parse_fin(promise.arguments, test);
         type = 'finally';
      } else if (is_then(promise.property)){
         result = parse_then(promise.arguments, test);
         type = 'then';
      }

      if (result){
         test = result.test;
         return {
            'catch_exits': result.catch_exits,
            'run_exits': result.run_exits,
            'type': type,
         }
      }
   }

   var last_caught_exit_index = 0;
   var last_run_exit_index = 0;
   
   for (var i = all_funcs.length - 1; i >= 0; i--){
      var parsed = parse(all_funcs[i]);
      if (parsed){
         if (parsed.catch_exits){
            last_caught_exit_index = i;
         }
         if (parsed.run_exits){
            last_run_exit_index = i;
         }
      } else{
         break;
      }
      all_funcs[i].type = parsed.type
   }

   var last_caught_index = 0;
   var last_run_index = 0;

   for (var i = 1; i < all_funcs.length; i++) {
      // start at 2nd element since 1st is original fcn call
      var property = all_funcs[i].property;
      var arguments = all_funcs[i].arguments;
      if (is_promise_method(property)){
         if (is_catch(property)){
            last_caught_index = i;
         } else{
            if (arguments.length > 1){
               // there's an error handling fcn involved
               last_caught_index = i;
            }
            last_run_index = i;
         }
      } else{
         break;
      }
   }

   return {
      'all_funcs': all_funcs,
      'last_caught_index': last_caught_index,
      'last_caught_exit_index': last_caught_exit_index,
      'last_run_index': last_run_index,
      'last_run_exit_index': last_run_exit_index,
   }
}

function check_function_calls(program, promise_funcs){
   /*
      Gets all function calls in a program which return promises.

      @param program: an esprima node representing an entire program
      @param promise_funcs: an array of names of functions determined to return 
         promises

      @return: an array of objects with the following properties
         `all_funcs`: an array of function calls from get_all_functions
         `last_caught_index`: the highest index (of `all_funcs`) at which 
            errors are caught (0 if none caught)
         `last_caught_exit_index`: the highest index (of `all_funcs`) at which 
            errors are caught and exited (0 if none exit)
         `last_run_index`: the highest index (of `all_funcs`) where code is run
         `last_run_exit_index`: the highest index (of `all_funcs`) where code 
            that exits is run
         `promise`: an esprima node for the full call
   */
   var promises = [];
   for (var i = 0; i < program.body.length; i++) {
      if (program.body[i].type === 'ExpressionStatement'){
         if (program.body[i].expression.type === 'CallExpression'){
            var callee = program.body[i].expression.callee;
            var first_func = get_first_function(callee);
            var promise = false;
            for (var j = 0; j < promise_funcs.length; j++) {
               if (variables_equal(promise_funcs[j], first_func)){
                  promise = true;
                  break;
               }
            }
            if (promise){
               var to_push = parse_promise_methods(program.body[i]);
               to_push.promise = program.body[i];
               promises.push(to_push);
            }
         }
      }
   }
   return promises;
}

function test_promises(parsed_code){
   /*
      Fully tests code for promises that exit.

      @param parsed_code: an esprima node for an entire program

      @returns: an array of objects each with the following properties:
         `all_funcs`: an array of function calls from get_all_functions
         `last_caught_index`: the highest index (of `all_funcs`) at which 
            errors are caught (0 if none caught)
         `last_caught_exit_index`: the highest index (of `all_funcs`) at which 
            errors are caught and exited (0 if none exit)
         `last_run_index`: the highest index (of `all_funcs`) where code is run
         `last_run_exit_index`: the highest index (of `all_funcs`) where code 
            that exits is run
         `promise`: an esprima node for the full call
   */
   var q_vars = get_qs(parsed_code);
   var funcs = check_function_decs(parsed_code, q_vars);
   var calls = check_function_calls(parsed_code, funcs);

   return calls;
}

module.exports = {
   'test': test_promises,
}
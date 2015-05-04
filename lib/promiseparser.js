var esprima = require('esprima');
var fs = require('fs');
var utils = require('./utils.js');

function get_qs(node){
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
   if (var1 && var2){
      if (var1.type === var2.type && var1.name === var2.name){
         return true;
      }
   }
   return false;
}

function is_defer(q_vars, callee){
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
   var all = get_all_functions(expr);
   if (all.length){
      return all[0];
   } else{
      return null;
   }
}

function get_all_functions(expr){
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

function check_function_calls(program, promise_funcs){
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
               parse_promise_methods(program.body[i]);
            }
         }
      }
   }
}

function is_then(node){
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
   var done = {
      'type': 'Identifier',
      'name': 'done'
   };
   return (variables_equal(done, node));
}

function is_promise_method(node){
   return is_then(node) || is_catch(node) || is_finally(node) || is_done(node);
}

function function_is_exit(fcn){
   for (var i = 0; i < fcn.body.body.length; i++) {
      if (utils.is_exit(fcn.body.body[i])){
         return true;
      }
   }
   return false;
}

function parse_done(arguments, test){
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
   }

   var len = all_funcs.length;
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

   if (last_caught_exit_index){
      if (last_caught_exit_index < last_caught_index){
         console.log("some caught exception(s) not exited");
      } else{
         console.log("all caught exceptions exit");
      }
   } else{
      console.log("no caught exceptions exit");
   }

   if (last_run_exit_index){
      if (last_run_exit_index < last_run_index){
         console.log("some successful run(s) not exited");
      } else{
         console.log("all successful runs exit");
      }
   } else{
      console.log("no successful runs exit");
   }
}

function test_promises(code, parsed_code){
   var q_vars = get_qs(parsed_code);
   var funcs = check_function_decs(parsed_code, q_vars);
   var calls = check_function_calls(parsed_code, funcs);
}


var code = fs.readFileSync('./test/fixtures/promise_fun.js', 'utf-8');
var parsed = esprima.parse(code, {
   // 'range': true,
   'loc': true
});

test_promises(code, parsed)
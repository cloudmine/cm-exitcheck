function wrapped_exit(args){
  exit(args);
}

for (var i = 0; i < 3; i++) {
  if (i % 3 == 0){
    console.log("stage 2");
  }
  else if (i % 3 == 1){
    if (a == b){
      console.log("nothing");
      // exit();
    }
    else {
      exit();
    }
    wrapped_exit();
  }
  else{
    /* 

    exit();

    */
  }
}



for (var i = 0; i < 5; i++) {
  switch(i){
    case 0:
      break;
    case 1:
      exit(param);
    case 2:
      wrapped_exit();
      break;
    default:
      break;
  }
}

var tryLogin = function() {
	
	var err_msgs = [];
	var form_inputs = $('form[name="loginForm"]').serializeArray();
	for (var i in form_inputs) {
		var input = form_inputs[i];
		
		if ( input.name == "email" && (input.value==null || input.value.length == 0) ) {
			err_msgs.push("Please enter your account email.");
		} 

		else if (input.name == "password" && (input.value==null || input.value.length == 0) ) {
			err_msgs.push("Please enter your password.");
		}
	}

	if (err_msgs.length == 0) {
		return true;
	}

	var err_str = err_msgs.join("<br/>");
	$("#form_msg").html(err_str);

	return false;
};

var trySignUp = function() {

	var err_msgs = [];
	var form_inputs = $('form[name="signupForm"]').serializeArray();
	var password = null;
	var confirm_password = null;
	var missing_name = false;

	for (var i in form_inputs) {
		var input = form_inputs[i];

		if ( input.name == "first" && (input.value==null || input.value.length==0) ) {
			missing_name = true;
		}

		else if ( input.name == "last" && (input.value==null || input.value.length==0) ) {
			missing_name = true;
		}

		else if ( input.name == "email") {

			var valid_email = true;
			if (input.value.indexOf('@') < 0 || input.value.indexOf('.') < 0) {
				valid_email = false;
			}
			if (input.value==null || input.value.length < 6 || !valid_email) {
				err_msgs.push("Please enter a valid email.");
			}
		}

		else if ( input.name == "password" ) {

			password = input.value;
			if ( input.value==null || input.value.length == 0 ) {
				err_msgs.push("Please enter your password.");
				break;
			} else if ( input.value.length < 6 ) {
				err_msgs.push("Password is too short.");
				break;
			}
		}

		else if ( input.name == "confirm_password") {

			if ( input.value==null || input.value.length == 0 ) {
				err_msgs.push("Please enter your password confirmation.");
			}
			confirm_password = input.value;
		}
	}

	if (missing_name==true) {
		err_msgs.unshift("Please enter your first & last name.");
	}

	if (err_msgs.length > 0) {
		var err_str = err_msgs.join("<br/>");
		$("#form_msg").html(err_str);
		return false;
	}

	if ( password != confirm_password ) {
		err_msgs.push("Confirmation does not match password.");
		var err_str = err_msgs.join("<br/>");
		$("#form_msg").html(err_str);
		return false;
	}

	return true;

};


var tryActivate = function() {

	var err_msgs = [];
	var form_inputs = $('form[name="activateForm"]').serializeArray();
	for (var i in form_inputs) {
		var input = form_inputs[i];
		
		if ( input.name == "user_id" && (input.value==null || input.value.length == 0) ) {
			err_msgs.push("Please enter user id.");
		} 

		else if ( input.name == "restaurant_id" && (input.value==null || input.value.length == 0) ) {
			err_msgs.push("Please enter restaurant id.");
		} 

		else if (input.name == "password" && (input.value==null || input.value.length == 0) ) {
			err_msgs.push("Please enter admin password.");
		}
	}

	if (err_msgs.length == 0) {
		return true;
	}

	var err_str = err_msgs.join("<br/>");
	$("#form_msg").html(err_str);

	return false;

}
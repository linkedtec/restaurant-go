'use strict';

angular.module('myApp.viewProfile', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewProfile', {
    templateUrl: 'view_profile/view_profile.html',
    controller: 'ViewProfileCtrl'
  });
}])

.controller('ViewProfileCtrl', function($scope, $http, ContactService, UserService) {

	
	$scope.profile = {};

	$scope.editing_password = false;

	$scope.initProfile = function() {

		var user_info = UserService.getUserInfo();

		$scope.profile = {
		    'first_name': user_info.first_name,
		    'last_name': user_info.last_name,
		    'email': user_info.email,
		    'phone': user_info.phone,
		};
	};
	$scope.initProfile();

	$scope.validateName = function(value) {
		if (value == null || value == undefined) {
			return false;
		}
		if (value.length < 1) {
			return false;
		}
		return true;
	};

	$scope.saveFirstName = function(new_value) {
		
		var putChange = {
			change_keys: ['first_name'],
			user: {
				first_name: new_value
			}
		};

		$http.put('/user', putChange).
	    success(function(data, status, headers, config) {

	    	$scope.profile['first_name'] = new_value;
	    	UserService.setFirstName(new_value);

	    }).
	    error(function(data, status, headers, config) {
	    	UserService.checkAjaxLoginRequired(data);
	    });
	};

	$scope.saveLastName = function(new_value) {
		
		var putChange = {
			change_keys: ['last_name'],
			user: {
				last_name: new_value
			}
		};

		$http.put('/user', putChange).
	    success(function(data, status, headers, config) {

	    	$scope.profile['last_name'] = new_value;
	    	UserService.setLastName(new_value);

	    }).
	    error(function(data, status, headers, config) {
	    	UserService.checkAjaxLoginRequired(data);
	    });
	};

	$scope.validateEmail = function(value) {
		return ContactService.isValidEmail(value);
	};

	$scope.saveEmail = function(new_value) {
		
		var putChange = {
			change_keys: ['email'],
			user: {
				email: new_value
			}
		};

		$http.put('/user', putChange).
	    success(function(data, status, headers, config) {

	    	$scope.profile['email'] = new_value;
	    	UserService.setEmail(new_value);

	    }).
	    error(function(data, status, headers, config) {
	    	UserService.checkAjaxLoginRequired(data);
	    });
	};

	$scope.validatePhone = function(value) {

		// it's okay to have an empty phone number
		if (value == null || value.length == 0) {
			return true;
		}

		return ContactService.isValidPhone(value);
	};

	$scope.savePhone = function(new_value) {
		
		var putChange = {
			change_keys: ['phone'],
			user: {
				phone: new_value
			}
		};

		$http.put('/user', putChange).
	    success(function(data, status, headers, config) {

	    	$scope.profile['phone'] = new_value;
	    	UserService.setPhone(new_value);

	    }).
	    error(function(data, status, headers, config) {
	    	UserService.checkAjaxLoginRequired(data);
	    });
	};



	$scope.editPassword = function() {
		$scope.edit_pw = {
			cur_pw: null,
			new_pw: null,
			confirm_pw: null
		};
		$scope.pw_form_ver = {
			cur_pw_error: false,
			new_pw_error: false,
			confirm_pw_error: false
		};
		//$scope.pw_err_msg = null;

		$scope.editing_password = true;
	};

	$scope.cancelEditPassword = function() {
		$scope.editing_password = false;
	};

	$scope.saveNewPassword = function() {

		console.log('save pw');

		$scope.pw_form_ver = {
			cur_pw_error: false,
			new_pw_error: false,
			confirm_pw_error: false
		};
		var all_clear = true;
		//$scope.pw_err_msg = null;

		if ($scope.edit_pw.cur_pw===null || $scope.edit_pw.cur_pw.length < 5) {
			$scope.pw_form_ver.cur_pw_error = true;
			all_clear = false;
		}

		if ($scope.edit_pw.new_pw===null || $scope.edit_pw.new_pw.length < 6) {
			$scope.pw_form_ver.new_pw_error = true;
			all_clear = false;
		}

		if ($scope.edit_pw.confirm_pw===null || $scope.edit_pw.confirm_pw.length < 6) {
			$scope.pw_form_ver.confirm_pw_error = true;
			all_clear = false;
		}

		if ($scope.edit_pw.new_pw != $scope.edit_pw.confirm_pw) {
			$scope.pw_form_ver.confirm_pw_error = true;
			all_clear = false;
		}

		if (!all_clear) {
			//$scope.pw_err_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again."
			return;
		}

		$http.put('/user/password', {
			old_pw: $scope.edit_pw.cur_pw,
			new_pw: $scope.edit_pw.new_pw
		}).
	    success(function(data, status, headers, config) {

	    	$scope.editing_password = false;
	    	swal({
                title: "Password Saved",
                text: "Your account password has been updated!",
                type: "success",
                timer: 3000,
                allowOutsideClick: true
            });
	    }).
	    error(function(data, status, headers, config) {
	    	UserService.checkAjaxLoginRequired(data);

	    	$scope.edit_pw.cur_pw = null;

	    	swal({
		        title: "Save Password Failed",
		        text: "We were unable to change your password, please make sure you entered your current password correctly!",
		        type: "error",
		        allowOutsideClick: true});
	    });
	};
	

});

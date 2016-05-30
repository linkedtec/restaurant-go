'use strict';

angular.module('myApp.viewProfile', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewProfile', {
    templateUrl: 'view_profile/view_profile.html',
    controller: 'ViewProfileCtrl'
  });
}])

.controller('ViewProfileCtrl', function($scope, $http, UserService) {

	$scope.form_ver = {};
	$scope.profile = {};

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

	$scope.validateFirstName = function(value) {
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

		console.log("PUTTING FIRST NAME");

		$http.put('/user', putChange).
	    success(function(data, status, headers, config) {

	    	$scope.profile['first_name'] = new_value;
	    	UserService.setFirstName(new_value);

	    }).
	    error(function(data, status, headers, config) {
	    	UserService.checkAjaxLoginRequired(data);
	    });
	};

	

});

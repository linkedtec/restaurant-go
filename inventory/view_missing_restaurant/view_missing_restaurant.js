'use strict';

angular.module('myApp.viewMissingRestaurant', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewMissingRestaurant', {
    templateUrl: 'view_missing_restaurant/view_missing_restaurant.html',
    controller: 'ViewMissingRestaurantCtrl'
  });
}])

.controller('ViewMissingRestaurantCtrl', function($scope, $http, UserService) {

	$scope.full_name = {value: null};
	$scope.restaurant = {value: null};
	$scope.sent = false;
	$scope.sending = false;  // Disables submit button while trying to send
	$scope.form_ver = {
		error_name: false,
		error_restaurant: false
	};
	$scope.new_failure_msg = null;

	$scope.send = function() {
	    
		var all_clear = true;
		$scope.form_ver = {
			error_name: false,
			error_restaurant: false
		};
		$scope.new_failure_msg = null;

		console.log($scope.full_name.value);

		if ($scope.full_name.value == null || $scope.full_name.value.length < 4) {
			$scope.form_ver.error_name = true;
			all_clear = false;
		}

		if ($scope.restaurant.value == null || $scope.restaurant.value.length < 3) {
			$scope.form_ver.error_restaurant = true;
			all_clear = false;
		}

		if (!all_clear) {
			$scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
			return;
		}

		$scope.sending = true;

		$http.post('/missing_restaurant', {
	      name: $scope.full_name.value,
	      restaurant: $scope.restaurant.value
	    }).
	    success(function(data, status, headers, config) {

	      $scope.sent = true;

	    }).
	    error(function(data, status, headers, config) {
	      UserService.checkAjaxLoginRequired(data);

	      $scope.sending = false;
	    });

	};

});

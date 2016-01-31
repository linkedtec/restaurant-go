'use strict';

angular.module('myApp.viewDashboard', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewDashboard', {
    templateUrl: 'view_dashboard/view_dashboard.html',
    controller: 'ViewDashboardCtrl'
  });
}])

.controller('ViewDashboardCtrl', function($scope, $modal, $http, $filter, DateService, ItemsService, MathService) {

  $scope.restaurant_name = null;
  $scope.dash_data = null;

  $scope.getRestaurant = function() {

    var test_restaurant_id = 1;

    $http.get('/restaurant/name', {
      params: {
        restaurant_id: test_restaurant_id
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.restaurant_name = data['name'];
      }
      else {
        $scope.restaurant_name = 'My Restaurant';
      }
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getRestaurant();

  $scope.getDashboard = function() {

    var test_user_id = 1;

    $http.get('/dashboard', {
      params: {
        user_id: test_user_id
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.dash_data = data;
        var purch_contact = $scope.dash_data['purchase_contact'];
        if (purch_contact!==null) {
          var pc_tokens = purch_contact.split(" ");
          if (pc_tokens.length > 1) {
            pc_tokens[pc_tokens.length-1] = pc_tokens[pc_tokens.length-1][0];
            purch_contact = pc_tokens.join(' ');
            console.log(purch_contact);
          }
          $scope.dash_data['purchase_contact'] = purch_contact;
        } else {
          $scope.dash_data['purchase_contact'] = '--';
        }

        if ($scope.dash_data['last_purchase_date'] !== null) {
          $scope.dash_data['last_purchase_date'] = DateService.getPrettyDate(
            $scope.dash_data['last_purchase_date'], true, true);
        } else {
          $scope.dash_data['last_purchase_date'] = "Never";
        }
      }
      else {
      }

      console.log($scope.dash_data);
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getDashboard();


});
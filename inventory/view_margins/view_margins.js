'use strict';

angular.module('myApp.viewMargins', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewMargins', {
    templateUrl: 'view_margins/view_margins.html',
    controller: 'ViewMarginsCtrl'
  });
}])

.controller('ViewMarginsCtrl', function($scope, $modal, $http, DateService) {

  $scope.showSpinner = false;

  $scope.margin_types = ['Latest Inventory Period'];
  $scope.margin_type = $scope.margin_types[0];

  $scope.initDate = function() {
    var today = new Date();
    $scope.start_date = new Date(today.setDate(today.getDate() - 6));
    $scope.start_date.setHours(0,0,0,0);
    $scope.end_date = new Date();
    $scope.end_date.setHours(23,59,59,999);
  };
  $scope.initDate();

  $scope.startDateLocal = function() {
    return DateService.clientTimeToRestaurantTime($scope.start_date);
  };

  $scope.endDateLocal = function() {
    return DateService.clientTimeToRestaurantTime($scope.end_date);
  };

  $scope.startDateChanged = function() {
    
  };

  $scope.endDateChanged = function() {
    
  };

  $scope.getMargins = function() {

    $scope.showSpinner = true;

    var params = { 
    restaurant_id: '1'
    };
    $http.get('/margins',
      {params: params}).
    success(function(data, status, headers, config) {

      $scope.showSpinner = false;

      console.log(data);

    }).
    error(function(data, status, headers, config) {
      $scope.showSpinner = false;
    });
  };
  $scope.getMargins();

});
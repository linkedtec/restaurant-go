'use strict';

angular.module('myApp.viewMargins', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewMargins', {
    templateUrl: 'view_margins/view_margins.html',
    controller: 'ViewMarginsCtrl'
  });
}])

.controller('ViewMarginsCtrl', function($scope, $modal, $http, DateService, UserService) {

  $scope.showSpinner = false;

  $scope.margin_types = ['Latest Inventory Period for each Beverage'];
  $scope.margin_type = $scope.margin_types[0];

  $scope.margins_data = null;

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

    $http.get('/margins').
    success(function(data, status, headers, config) {

      $scope.showSpinner = false;

      console.log(data);

      $scope.margins_data = data;

      for (var i in $scope.margins_data) {
        var margin = $scope.margins_data[i];
        margin['utilization'] = margin['vol_sold_L'] / (margin['vol_sold_L'] + margin['vol_waste_L']) * 100.0;
        margin['inv_update1_pretty'] = DateService.getPrettyDate(margin['inv_update1'], true, true);
        margin['inv_update2_pretty'] = DateService.getPrettyDate(margin['inv_update2'], true, true);
      }

    }).
    error(function(data, status, headers, config) {
      $scope.showSpinner = false;
      UserService.checkAjaxLoginRequired(data);
    });
  };
  $scope.getMargins();

});
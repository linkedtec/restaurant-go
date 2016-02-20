'use strict';

angular.module('myApp.viewPOSSales', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewPOSSales', {
    templateUrl: 'view_sales/view_sales.html',
    controller: 'ViewPOSSalesCtrl'
  });
}])

.controller('ViewPOSSalesCtrl', function($scope, $modal, $http, DateService) {

  $scope.pos_data = [];

  // sorting
  $scope.sort_key = null;
  $scope.double_sort = -1;
  $scope.firstTimeSort = true;

  $scope.showSpinner = false;

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

  $scope.getSalesData = function() {

    $scope.showSpinner = true;
    $http.get('/pos/clover', {
      params: {
        start_date:$scope.startDateLocal(),
        end_date:$scope.endDateLocal()
      }
    }).
    success(function(data, status, headers, config) {
      $scope.showSpinner = false;
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.pos_data = data;

        if ($scope.firstTimeSort===true) {
          $scope.firstTimeSort = false;
          $scope.sortBy('total');
        } else {
          $scope.sortBy($scope.sort_key);
          $scope.sortBy($scope.sort_key);
        }
      } else {
        $scope.pos_data = [];
      }
    }).
    error(function(data, status, headers, config) {
      $scope.showSpinner = false;
    });
  };
  $scope.getSalesData();

  $scope.startDateChanged = function() {
    $scope.getSalesData();
  };

  $scope.endDateChanged = function() {
    $scope.getSalesData();
  };


  $scope.sortBy = function(sort_str) {
    var double_sort = sort_str === $scope.sort_key;
    if (double_sort) {
      $scope.double_sort *= -1;
    } else {
      $scope.double_sort = -1;
    }
    $scope.sort_key = sort_str;
    var isNum = (sort_str === 'count' || sort_str === 'total' || sort_str === 'price');
    $scope.pos_data.sort(function(a, b) {
      var keyA = a[sort_str];
      var keyB = b[sort_str];
      if ($scope.double_sort > 0) {
        if (keyA === null) {
          return -1;
        } else if (keyB === null) {
          return 1;
        }
        if (isNum)
        {
          return parseFloat(keyA) - parseFloat(keyB);
        } else {
          return -keyA.localeCompare(keyB);
        }
      }
      if (keyA === null) {
        return 1;
      } else if (keyB === null) {
        return -1;
      }
      if (isNum)
      {
        return parseFloat(keyB) - parseFloat(keyA);
      } else {
        return keyA.localeCompare(keyB);
      }
    });
  };

});
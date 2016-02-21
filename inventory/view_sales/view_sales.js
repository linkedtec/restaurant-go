'use strict';

angular.module('myApp.viewPOSSales', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewPOSSales', {
    templateUrl: 'view_sales/view_sales.html',
    controller: 'ViewPOSSalesCtrl'
  });
}])

.controller('ViewPOSSalesCtrl', function($scope, $modal, $http, DateService, ItemsService, MathService) {

  $scope.inventory_items = [];
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

        // match clover_pos data to our own data using Levenshtein distance
        // algorithm
        for (var i in $scope.pos_data) {
          var best_match = null;
          var best_score = 9999;
          var pos_item = $scope.pos_data[i];
          var pos_str = pos_item['name'];
          // if the pos_str starts with the sell volume, such as 1L or .5L,
          // remove the first substring prior to a space, e.g.,
          // 1L Black Lager ==> Black Lager
          if (pos_str[0]==='.' || !isNaN(parseInt(pos_str[0]))) {
            if (pos_str.indexOf(' ') > 0) {
              pos_str = pos_str.substring(pos_str.indexOf(' ')+1);
            }
          }

          for (var j in $scope.inventory_items) {
            var our_item = $scope.inventory_items[j];

            // the pos string concatenates product with brewery, so we try
            // to match that
            var our_str = our_item['product'] + ' ' + our_item['brewery'];
            console.log("Comparing: " + pos_str + " AND " + our_str);
            var score = MathService.getLevenshteinDistance(pos_str, our_str);
            var len_factor = Math.max(pos_str.length, our_str.length);
            score = score / len_factor;
            console.log("    " + score);

            /*
            var score = MathService.getBevNameFuzzyMatch(
              our_item['product'], pos_str, our_item['brewery'], pos_str);
            */
            if (score < best_score) {
              best_score = score;
              best_match = our_item;
            }
          }

          console.log("Best match is: " + best_match['product'] + " with a score of " + best_score);
          $scope.pos_data[i]['product'] = best_match['product'];
          $scope.pos_data[i]['brewery'] = best_match['brewery'];
          $scope.pos_data[i]['match_score'] = best_score;
          
        }

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
  
  $scope.getAllInv = function() {

    $scope.showSpinner = true;

    $http.get('/inv').
    success(function(data, status, headers, config) {

      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      $scope.inventory_items = data;

      if ($scope.inventory_items===null || $scope.inventory_items.length === 0) {
        $scope.inventory_items = [];
      }

      ItemsService.processBevsForAddable($scope.inventory_items);
      $scope.getSalesData();
    }).
    error(function(data, status, headers, config) {
      $scope.getSalesData();
    });
  };
  // this is the entry point to this controller
  // after it is done, will get PoS data
  $scope.getAllInv();

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
    var isNum = (sort_str === 'count' || sort_str === 'total' || sort_str === 'price' || sort_str === 'match_score');
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
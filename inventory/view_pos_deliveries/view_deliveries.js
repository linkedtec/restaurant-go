'use strict';

angular.module('myApp.viewDeliveries', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewDeliveries', {
      templateUrl: 'view_pos_deliveries/view_deliveries.html',
      controller: 'ViewDeliveriesCtrl'
    });
}])

.controller('ViewDeliveriesCtrl', function($scope, $modal, $http, DateService, MathService, DistributorsService) {

  $scope.show_add_ui = false;

  $scope.distributors = null;

  $scope.addDeliveryControl = {};

  $scope.deliveries = [];

  $scope.initDate = function() {
    var today = new Date();
    $scope.start_date = new Date(today.setDate(today.getDate() - 30));
    $scope.end_date = new Date();
    $scope.end_date.setHours(23,59,59);
  };
  $scope.initDate();

  $scope.startDateLocal = function() {
    return $scope.start_date;
  };

  $scope.endDateLocal = function() {
    return $scope.end_date;
  };

  $scope.getDeliveries = function() {
    $http.get('/deliveries', {
      params: { 
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset()
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      var deliveries = [];

      if (data!==null && data!=="null") {
        deliveries = data;
      }

      for (var i in deliveries) {
        var dlv = deliveries[i];
        var date_str = dlv['delivery_time'];
        dlv['pretty_date'] = DateService.getPrettyDate(date_str, true);

        // get the sum of item values for the delivery
        var inv_sum = 0;
        for (var j in dlv.delivery_items) {
          inv_sum += dlv.delivery_items[j].value;
        }
        dlv['inv_sum'] = inv_sum;
      }

      $scope.deliveries = deliveries;

    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getDeliveries();

  $scope.exportSpreadsheet = function() {
    console.log("export spreadsheet");

    $http.get('/deliveries', {
      params: { 
        start_date: $scope.startDateLocal(),
        end_date: $scope.endDateLocal(),
        tz_offset: DateService.timeZoneOffset(),
        export:'xlsx' }
    }).
    success(function(data, status, headers, config) {
      console.log(data);
      var URL = data['url'];
      // create an iframe to download the file at the url
      var iframe = document.createElement("iframe");
      iframe.setAttribute("src", URL);
      iframe.setAttribute("style", "display: none");
      document.body.appendChild(iframe);
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getDistributors = function() {
    var result = DistributorsService.get();
    result.then(
      function(payload) {
        var data = payload.data;
        console.log(data);
        $scope.distributors = data;
        if ($scope.distributors===null || $scope.distributors.length === 0) {
          $scope.distributors = [];
        } else {
          for (var i in $scope.distributors) {
            if ($scope.distributors[i].kegs === null) {
              $scope.distributors[i].kegs = [];
            }
          }
        }
      },
      function(errorPayload) {
        ; // do nothing for now
      });
  };

  $scope.reSort = function() {
    $scope.deliveries.sort(function(a, b) {
      var keyA = a['delivery_time'];
      var keyB = b['delivery_time'];

      return keyB - keyA;
    });
  };

  $scope.newDeliveryCloseOnSave = function(new_delivery) {

    console.log(new_delivery);

    $scope.getDeliveries();

    $scope.hideAddDelivery();

  };

  // Shows the add new inventory item UI box
  $scope.showAddDelivery = function() {
    $scope.show_add_ui=true;
    $scope.addDeliveryControl.clearNewForm();

    if ($scope.distributors === null) {
      $scope.getDistributors();
    }
  };

  $scope.hideAddDelivery = function() {
    $scope.show_add_ui=false;
  };

  $scope.startDateChanged = function() {
    console.log($scope.start_date);

    $scope.getDeliveries();
  };

  $scope.endDateChanged = function() {
    console.log($scope.end_date);

    $scope.getDeliveries();
  };

});
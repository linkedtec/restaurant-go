'use strict';

angular.module('myApp.viewPODeliveries', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewPODeliveries', {
      templateUrl: 'view_pos_deliveries_new/view_pos_deliveries.html',
      controller: 'ViewPODeliveriesCtrl'
    });
}])

.controller('ViewPODeliveriesCtrl', function($scope, $modal, $http, DateService, MathService, DistributorsService, DeliveriesService) {

  $scope.purchase_orders = [];

  $scope.initDate = function() {
    var today = new Date();
    $scope.start_date = new Date(today.setDate(today.getDate() - 6));
    $scope.start_date.setHours(0,0,0,0);
    $scope.end_date = new Date();
    $scope.end_date.setHours(23,59,59,999);
  };
  $scope.initDate();

  $scope.startDateLocal = function() {
    return $scope.start_date;
  };

  $scope.endDateLocal = function() {
    return $scope.end_date;
  };

  $scope.getPurchaseOrders = function() {
    var params = { 
      start_date: $scope.startDateLocal(),
      end_date: $scope.endDateLocal()
    };
    $http.get('/purchase/all', 
      {params: params })
    .success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data === null) {
        $scope.purchase_orders = [];
      } else {
        $scope.purchase_orders = data;
      }

      for (var i in $scope.purchase_orders) {
        var total = 0.0;
        var po = $scope.purchase_orders[i];
        for (var j in po.distributor_orders) {
          var dist_order = po.distributor_orders[j];
          total += dist_order['total'];
        }
        po.order['total'] = total;

        if (po.order['send_method'] === 'email') {
          po.order['send_method_pretty'] = 'Email';
        } else if (po.order['send_method'] === 'text') {
          po.order['send_method_pretty'] = 'SMS Text';
        } else if (po.order['send_method'] === 'save') {
          po.order['send_method_pretty'] = 'Save Only'
        }
      }

    })
    .error(function(data, status, headers, config) {

    });

  };
  $scope.getPurchaseOrders();

  $scope.startDateChanged = function() {
    console.log($scope.start_date);

    $scope.getPurchaseOrders();
  };

  $scope.endDateChanged = function() {
    console.log($scope.end_date);

    $scope.getPurchaseOrders();
  };

});
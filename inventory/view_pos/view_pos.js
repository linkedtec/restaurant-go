'use strict';

angular.module('myApp.viewPurchaseOrders', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewPurchaseOrders', {
      templateUrl: 'view_pos/view_pos.html',
      controller: 'ViewPurchaseOrdersCtrl'
    });
}])

.controller('ViewPurchaseOrdersCtrl', function($scope, $modal, $http, DistributorsService, ItemsService) {

  // showMode shows the different stages of the purchase order process,
  // 0 being the "choose automatic vs manual"
  // 1 being actually filling out the purchase order forms
  $scope.showMode = 0;
  $scope.useMode = null;

  $scope.all_bevs = [];

  $scope.order = {};
  $scope.order['dist_orders'] = [];

  $scope.initManualForm = function() {
    $scope.order['dist_orders'] = [{
      distributor: null,
      delivery_date: new Date(),
      addable_items: [],
      items: [],
      show_add_ui:false,
      addableControl: {}
    }];

    console.log($scope.order['dist_orders']);

  };

  $scope.setShowMode = function(mode, use_mode) {
    $scope.showMode = mode;

    $scope.useMode = use_mode;

    if (use_mode === 'manual') {
      $scope.initManualForm();
    }
  };

  $scope.cancelPurchaseOrder = function() {

    var queryCancel = false;
    for (var i in $scope.order['dist_orders']) {
      var dorder = $scope.order['dist_orders'][i];
      if (dorder['distributor'] !== null) {
        queryCancel = true;
      }
    }

    if (queryCancel === true) {
      swal({
          title: "Discard Purchase Order?",
          text: "Are you sure you want to discard your changes and cancel this Purchase Order?",
          type: "warning",
          showCancelButton: true,
          html: true,
          confirmButtonColor: "#DD6B55",
          confirmButtonText: "Yes, discard it!"
          },
          function() {
            $scope.setShowMode(0, null);
            setInterval(
              function() {
                $scope.$apply();
              }, 0);
        });
    } else {
      $scope.setShowMode(0, null);
    }
    
  };

  $scope.showAddInv = function(dist_order) {
    dist_order.show_add_ui = true;
  };

  $scope.hideAddInv = function(dist_order) {
    dist_order.show_add_ui = false;
  };

  $scope.addItem = function(dist_order, item) {
    console.log(item);

    item['quantity'] = null;

    for (var i in dist_order.addable_items) {
      var check_item = dist_order.addable_items[i];
      if (check_item.version_id === item.version_id) {
        dist_order.items.push(item);
        dist_order.addable_items.splice(i, 1);
        break;
      }
    }

    dist_order.addableControl.applyTypeFilter();
    console.log(dist_order.addable_items);
  };

  $scope.removeAddedItem = function(item) {
    for (var i in $scope.order.dist_orders) {
      var dorder = $scope.order.dist_orders[i];
      for (var j in dorder.items) {
        var check_item = dorder.items[j];
        if (check_item === item) {
          dorder.items.splice(j, 1);
          item['quantity'] = null;
          dorder.addable_items.push(item);
          dorder.addableControl.applyTypeFilter();
          break;
        }
      }
    }
  };

  $scope.getAllDistributors = function() {

    var result = DistributorsService.get();
    result.then(function(payload) {
      var data = payload.data;
      
      $scope.all_distributors = data;
      console.log(data);
      },
      function(errorPayload) {
        ; // do nothing for now
      });
  };
  $scope.getAllDistributors();

  $scope.selectDistributor = function(dist_order, dist) {
    dist_order['distributor'] = dist;

    dist_order['addable_items'] = JSON.parse(JSON.stringify($scope.all_bevs));
  }

  $scope.addDistributorOrder = function() {
    $scope.order['dist_orders'].push({
      distributor:null, 
      delivery_date: new Date(), 
      items:[],
      show_add_ui:false});
  };

  $scope.getAllInv = function() {

    $http.get('/inv').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.all_bevs = data;
        ItemsService.processBevsForAddable($scope.all_bevs);

      }
      else {
        $scope.all_bevs = [];
      }
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getAllInv();


});
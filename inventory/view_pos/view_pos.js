'use strict';

angular.module('myApp.viewPurchaseOrders', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewPurchaseOrders', {
      templateUrl: 'view_pos/view_pos.html',
      controller: 'ViewPurchaseOrdersCtrl'
    });
}])

.controller('ViewPurchaseOrdersCtrl', function($scope, $modal, $http, DateService, DistributorsService, ItemsService, MathService) {

  // showMode shows the different stages of the purchase order process,
  // 0 being the "choose automatic vs manual"
  // 1 being actually filling out the purchase order forms
  $scope.showMode = 0;
  $scope.useMode = null;

  $scope.all_bevs = [];

  $scope.order = {};
  $scope.order['restaurant_name'] = null;
  $scope.order['purchase_contact'] = null;
  $scope.order['purchase_email'] = null;
  $scope.order['purchase_phone'] = null;
  $scope.order['purchase_fax'] = null;
  $scope.showPurchaseSave = false;
  $scope.defaultContactChecked = true;
  $scope.order['dist_orders'] = [];
  $scope.order['order_date'] = new Date();
  $scope.order['order_date_pretty'] = DateService.getPrettyDate((new Date()).toString(), false, true);


  $scope.getRestaurant = function() {
    $http.get('/restaurant/name').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.order['restaurant_name'] = data['name'];
      }
      else {
        $scope.order['restaurant_name'] = null;
      }
    }).
    error(function(data, status, headers, config) {

    });

    $http.get('/restaurant/purchase').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.order['purchase_contact'] = data['purchase_contact'];
        $scope.order['purchase_contact_edit'] = data['purchase_contact'];
        $scope.order['purchase_email'] = data['purchase_email'];
        $scope.order['purchase_email_edit'] = data['purchase_email'];
        $scope.order['purchase_phone'] = data['purchase_phone'];
        $scope.order['purchase_phone_edit'] = data['purchase_phone'];
        $scope.order['purchase_fax'] = data['purchase_fax'];
        $scope.order['purchase_fax_edit'] = data['purchase_fax'];
      }
      else {
        $scope.order['purchase_contact'] = null;
        $scope.order['purchase_contact_edit'] = null;
        $scope.order['purchase_email'] = null;
        $scope.order['purchase_email_edit'] = null;
        $scope.order['purchase_phone'] = null;
        $scope.order['purchase_phone_edit'] = null;
        $scope.order['purchase_fax'] = null;
        $scope.order['purchase_fax_edit'] = null;
      }
    }).
    error(function(data, status, headers, config) {

    });

  };

  $scope.initManualForm = function() {
    $scope.order['dist_orders'] = [{
      distributor: null,
      delivery_date: new Date(),
      addable_items: [],
      items: [],
      total: null,
      show_add_ui:false,
      addableControl: {}
    }];

    console.log($scope.order['dist_orders']);
    $scope.getRestaurant();

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

  $scope.orderDateChanged = function() {
    var date_str = $scope.order['order_date'].toString();
    $scope.order['order_date_pretty'] = DateService.getPrettyDate(date_str, false, true);
    setInterval(
      function() {
        $scope.$apply();
      }, 0);
  };

  $scope.purchasingChanged = function() {
    if ($scope.order['purchase_contact_edit'] === '') {
      $scope.order['purchase_contact_edit'] = null;
    }
    if ($scope.order['purchase_email_edit'] === '') {
      $scope.order['purchase_email_edit'] = null;
    }
    if ($scope.order['purchase_phone_edit'] === '') {
      $scope.order['purchase_phone_edit'] = null;
    }
    if ($scope.order['purchase_fax_edit'] === '') {
      $scope.order['purchase_fax_edit'] = null;
    }

    if ($scope.order['purchase_contact'] !== $scope.order['purchase_contact_edit'] ||
      $scope.order['purchase_email'] !== $scope.order['purchase_email_edit'] ||
      $scope.order['purchase_phone'] !== $scope.order['purchase_phone_edit'] || 
      $scope.order['purchase_fax'] !== $scope.order['purchase_fax_edit']) {
      $scope.showPurchaseSave = true;
    } else {
      console.log("NO CHANGE");
      $scope.showPurchaseSave = false
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
          $scope.updateDistOrderTotal(dorder);
          break;
        }
      }
    }
  };

  $scope.updateQuantity = function(item) {
    if (item['quantity'] === '') {
      item['quantity'] = null;
      return;
    }

    if (MathService.numIsInvalid(item['quantity'])) {
      item['subtotal'] = null;
      return;
    }

    item['subtotal'] = item['batch_cost'] * item['quantity'];
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

    if (dist === dist_order['distributor']) {
      return;
    }

    dist_order['distributor'] = dist;

    dist_order['addable_items'] = JSON.parse(JSON.stringify($scope.all_bevs));
    dist_order['items'] = [];
  }

  $scope.addDistributorOrder = function() {
    $scope.order['dist_orders'].push({
      distributor:null, 
      delivery_date: new Date(), 
      items:[],
      total:null,
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

  $scope.updateDistOrderTotal = function(dorder) {
    dorder.total = 0;
    for ( var i in dorder.items ) {
      var item = dorder.items[i];
      if (!MathService.numIsInvalid(item['quantity'])) {
        dorder.total += item['batch_cost'] * item['quantity'];
      }
    }
  };

  $scope.reviewAndSave = function() {
    // do these checks:
    // Restaurant Basic Info:
    //   - restaurant contact is not null, at least 2 characters
    //   - restaurant email is not null, valid email
    //
    // Distributor Orders:
    //   - if no distributor selected, just splice and omit
    //   - if has no added items, error
    //   - if items missing quantity, error
    //   - if est delivery date invalid, error
    //   - if no email or email is invalid, error
  }


});
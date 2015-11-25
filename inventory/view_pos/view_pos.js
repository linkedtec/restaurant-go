'use strict';

angular.module('myApp.viewPurchaseOrders', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewPurchaseOrders', {
      templateUrl: 'view_pos/view_pos.html',
      controller: 'ViewPurchaseOrdersCtrl'
    });
}])

.controller('ViewPurchaseOrdersCtrl', function($scope, $modal, $http, ContactService, DateService, DistributorsService, ItemsService, MathService) {

  // showMode shows the different stages of the purchase order process,
  // 0 being the "choose automatic vs manual"
  // 1 being actually filling out the purchase order forms
  $scope.showMode = 0;
  $scope.useMode = null;

  $scope.all_bevs = [];

  $scope.all_distributors = [];
  $scope.sel_distributors = [];

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
  $scope.deliveryAddressControl = {};

  $scope.form_ver = {};
  $scope.new_failure_msg = null;

  $scope.showAutoHelp = function($event) {
    $event.preventDefault();
    $event.stopPropagation();

    swal({
      title: "Test!",
      text: "hi.",
      type: "success",
      timer: 4000,
      allowOutsideClick: true,
      html: true});
  };

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

  $scope.addDistributorOrder = function() {
    $scope.order['dist_orders'].push({
      distributor:null, 
      delivery_date: null, 
      addable_items: [],
      items:[],
      total:null,
      show_add_ui:false,
      addableControl: {},
      sort_key: null,
      additional_notes: null,
      save_default_email: null,
      double_sort: -1});
  };

  $scope.initDistOrders = function() {
    $scope.order['dist_orders'] = [];
    $scope.addDistributorOrder();
  };

  $scope.initManualForm = function() {
    $scope.getAllDistributors();
    $scope.initDistOrders();
    $scope.refreshSelectableDistributors();

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

  $scope.cancelPurchaseOrder = function(force) {

    var queryCancel = false;
    for (var i in $scope.order['dist_orders']) {
      var dorder = $scope.order['dist_orders'][i];
      if (dorder['distributor'] !== null) {
        queryCancel = true;
      }
    }

    if (queryCancel === true && force!==true) {
      swal({
          title: "Discard Purchase Order?",
          text: "Candeling this Purchase Order will discard any changes you've made.  Are you sure?",
          type: "warning",
          showCancelButton: true,
          html: true,
          confirmButtonColor: "#DD6B55",
          confirmButtonText: "Yes, discard it!"
          },
          function() {
            $scope.setShowMode(0, null);
            $scope.$apply();
        });
    } else {
      $scope.setShowMode(0, null);
    }
    
  };

  $scope.orderDateChanged = function() {
    var date_str = $scope.order['order_date'].toString();
    $scope.order['order_date_pretty'] = DateService.getPrettyDate(date_str, false, true);
    $scope.$apply();
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

  $scope.addAdditionalNote = function(dorder) {
    dorder['additional_notes'] = '';
  };

  $scope.updateQuantity = function(item, dorder) {
    if (item['quantity'] === '') {
      item['quantity'] = null;
      return;
    }

    if (MathService.numIsInvalid(item['quantity'])) {
      item['subtotal'] = null;
      return;
    }

    item['subtotal'] = item['batch_cost'] * item['quantity'];

    $scope.updateDistOrderTotal(dorder);
  };


  $scope.matchQuantityToPar = function(item, dorder) {
    if (item['count_recent']===null || item['par']===null) {
      return;
    }
    var diff = item['par'] - item['count_recent'];
    if (diff <= 0) {
      item['quantity'] = 0;
    } else {
      item['quantity'] = Math.round(diff);
    }
    $scope.updateQuantity(item, dorder);
    
  };

  $scope.getAllDistributors = function() {

    $scope.all_distributors = [];

    var result = DistributorsService.get();
    result.then(function(payload) {
      var data = payload.data;
      
      for (var i in data) {
        var dist = data[i];
        dist['email_edit'] = dist['email'];
        $scope.all_distributors.push(dist);
        $scope.sel_distributors.push(dist);
      }

      console.log(data);
      },
      function(errorPayload) {
        ; // do nothing for now
      });
  };
  //$scope.getAllDistributors();

  $scope.distEmailChanged = function(dorder) {
    var dist = dorder.distributor;
    if (dist===undefined || dist===null) {
      return;
    }
    if (dist.email_edit === '') {
      dist.email_edit = null;
    }

    if (dorder.save_default_email===null && dist.email_edit !==dist.email) {
      dorder.save_default_email = true;
    }
  };

  $scope.refreshSelectableDistributors = function() {
    // refresh the selectable distributors list based on which distributors
    // have not yet been added to dist orders
    $scope.sel_distributors = [];
    for (var i in $scope.all_distributors) {
      var d = $scope.all_distributors[i];
      var d_added = false;
      for (var j in $scope.order.dist_orders) {
        var dorder = $scope.order.dist_orders[j];
        if (dorder.distributor === null) {
          continue;
        }
        if (dorder.distributor.id === d.id) {
          d_added = true;
          break;
        }
      }
      if (!d_added) {
        $scope.sel_distributors.push(d);
      }
    }
  }

  $scope.selectDistributor = function(dist_order, dist) {

    if (dist === dist_order['distributor']) {
      return;
    }

    dist_order['distributor'] = dist;

    dist_order['addable_items'] = JSON.parse(JSON.stringify($scope.all_bevs));
    dist_order['items'] = [];

    $scope.refreshSelectableDistributors();
  };

  $scope.deleteDistOrder = function(index) {
    if ($scope.order['dist_orders'].length === 1) {
      return;
    }
    if ($scope.order['dist_orders'].length <= index) {
      return;
    }
    $scope.order['dist_orders'].splice(index,1);
    $scope.refreshSelectableDistributors();
  }

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

  $scope.sortDistOrderBevs = function(dorder, sort_str) {
    var double_sort = sort_str === dorder.sort_key;
    if (double_sort) {
      dorder.double_sort *= -1;
    } else {
      dorder.double_sort = -1;
    }
    dorder.sort_key = sort_str;
    var isNum = (sort_str === 'batch_cost' || sort_str === 'par' || sort_str === 'quantity' || sort_str === 'subtotal');

    dorder.items.sort(function(a, b) {
      var keyA = a[sort_str];
      var keyB = b[sort_str];
      if (dorder.double_sort > 0) {
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

  $scope.reviewPurchaseOrders = function(pdf_url, post_order) {
    var modalEditInstance = $modal.open({
      templateUrl: 'reviewPurchaseOrderModal.html',
      controller: 'reviewPurchaseOrderModalCtrl',
      windowClass: 'review-purch-modal',
      backdropClass: 'white-modal-backdrop',
      backdrop : 'static',
      resolve: {
        pdf_url: function() {
          return pdf_url;
        },
        post_order: function() {
          return post_order;
        },
        read_only: function() {
          return false;
        }
      }
    });

    modalEditInstance.result.then(
      // success status
      function( result ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is the affected beverage
        var status = result[0];
        
        // after a save, we want to show a success dialogue with an optional
        // CC email address
        if (status === 'save') {
          swal({
            title: "Purchase Orders Sent!",
            text: "Your Purchase Order(s) were sent to your Distributors!  You can view past orders in the Purchase History page.",
            type: "success",
            allowOutsideClick: true,
            html: true});

          // cancel purchase order with force=true to clear the form
          $scope.cancelPurchaseOrder(true);

        } else if (status === 'error') {
          swal({
            title: "Error Encountered!",
            text: "There was an error sending your Purchase Orders, please try again later.",
            type: "error",
            allowOutsideClick: true,
            html: true});
        }

      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.reviewAndSave = function() {

    var all_clear = true;
    $scope.form_ver.error_contact = false;
    $scope.form_ver.error_email = false;
    $scope.form_ver.error_phone = false;
    $scope.form_ver.error_fax = false;
    $scope.new_failure_msg = null;

    // =========================================================================
    // CHECK BASIC INFO
    // =========================================================================
    // Restaurant Basic Info:
    //   - restaurant contact is not null, at least 2 characters
    //   - restaurant email is not null, valid email
    //   - if phone is not null, phone is valid
    //   - if fax is not null, fax is valid
    if ($scope.order['purchase_contact_edit'] === null || $scope.order['purchase_contact_edit'].length < 2) {
      $scope.form_ver.error_contact = true;
      all_clear = false;
    }
    if ($scope.order['purchase_email_edit'] === null || !ContactService.isValidEmail($scope.order['purchase_email_edit'])) {
      $scope.form_ver.error_email = true;
      all_clear = false;
    }
    if ($scope.order['purchase_phone_edit'] !== null && $scope.order['purchase_phone_edit'].length > 0 && !ContactService.isValidPhone($scope.order['purchase_phone_edit'])) {
      $scope.form_ver.error_phone = true;
      all_clear = false;
    }
    if ($scope.order['purchase_fax_edit'] !== null && $scope.order['purchase_fax_edit'].length > 0 && !ContactService.isValidPhone($scope.order['purchase_fax_edit'])) {
      $scope.form_ver.error_fax = true;
      all_clear = false;
    }

    var addressValid = $scope.deliveryAddressControl.validateAddress();
    if (addressValid !== true) {
      all_clear = false;
    }

    // =========================================================================
    // CHECK DISTRIBUTOR ORDERS
    // =========================================================================
    // Distributor Orders:
    //   - if no distributor selected, just splice and omit
    //   - if no email or email is invalid, error
    //   - if est delivery date invalid, error
    //   - if has no added items, error
    //   - if items missing quantity, error
    //   - if items quantity invalid, error
    //   - if item has 0 quantity, error

    // first remove any dist_orders which don't have a distributor selected
    var valid_dorders = []
    for (var i in $scope.order['dist_orders']) {
      var dorder = $scope.order.dist_orders[i];
      if (dorder.distributor === null) {
        continue;
      }
      valid_dorders.push(dorder);
    }
    if (valid_dorders.length == 0) {
      $scope.initDistOrders();
      $scope.new_failure_msg = "Please add items to your empty Distributor Orders and try again!";
      return;
    }

    $scope.order['dist_orders'] = valid_dorders;

    for (var i in $scope.order['dist_orders']) {
      var dorder = $scope.order.dist_orders[i];
      dorder.error_dist_email = false;
      dorder.error_delivery_date = false;
      dorder.error_empty_items = false;

      if (dorder.distributor.email_edit === null || !ContactService.isValidEmail(dorder.distributor.email_edit)) {
        all_clear = false;
        dorder.error_dist_email = true;
      }

      if (dorder.delivery_date === null || !DateService.isValidDate(dorder.delivery_date)) {
        all_clear = false;
        dorder.error_delivery_date = true;
      }

      if (dorder.items === null || dorder.items.length===0) {
        all_clear = false;
        dorder.error_empty_items = true;
        dorder.items = [];
      }

      for (var j in dorder.items) {
        var item = dorder.items[j];
        item.error_quantity = false;
        if (item.quantity === null || MathService.numIsInvalid(item.quantity) || item.quantity===0) {
          item.error_quantity = true;
          all_clear = false;
        }
      }
    }

    if (!all_clear) {
      $scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
      return;
    }

    // POSTING
    // We need to post the following:
    // Order Information:
    //     - order date
    //     - purchase contact
    //     - purchase email
    //     - purchase phone
    //     - purchase fax
    //     - purchase save default
    //     - restautant delivery address type (restaurant or delivery)
    // Distributor Orders
    //     - distributor id
    //     - distributor email
    //     - distributor overwrite default email
    //     - delivery date
    //     - ordered items:
    //         - item id
    //         - item quantity
    //         - item subtotal
    //     - purchase total

    // Basic Order Info --------------------------------------------------------
    $scope.post_order = {};
    $scope.post_order['order'] = {};
    $scope.post_order['order']['order_date'] = $scope.order['order_date_pretty'];  // pass the prettified date string instead of the date itself
    $scope.post_order['order']['purchase_contact'] = $scope.order['purchase_contact_edit'];
    $scope.post_order['order']['purchase_email'] = $scope.order['purchase_email_edit'];
    $scope.post_order['order']['purchase_phone'] = $scope.order['purchase_phone_edit'];
    $scope.post_order['order']['purchase_fax'] = $scope.order['purchase_fax_edit'];
    // should server save posted purchase info as default?
    $scope.post_order['order']['purchase_save_default'] = ($scope.showPurchaseSave===true && $scope.defaultContactChecked===true);
    $scope.post_order['order']['delivery_address_type'] = $scope.deliveryAddressControl.getChosenAddressType();

    // Distributor Orders ------------------------------------------------------
    $scope.post_order['dist_orders'] = [];
    for (var i in $scope.order['dist_orders']) {
      var copy_dorder = $scope.order['dist_orders'][i];
      var dorder = {};
      dorder['distributor'] = copy_dorder['distributor']['name'];
      dorder['distributor_id'] = copy_dorder['distributor']['id'];
      dorder['distributor_email'] = copy_dorder['distributor']['email_edit'];
      dorder['distributor_email_save_default'] = copy_dorder['save_default_email'];
      dorder['delivery_date'] = DateService.getPrettyDate(copy_dorder['delivery_date'].toString(), false, true);
      dorder['total'] = copy_dorder['total'];
      dorder['additional_notes'] = copy_dorder['additional_notes'];
      if (dorder['additional_notes']==='' || dorder['additional_notes']===' ') {
        dorder['additional_notes'] = null;
      }
      // handle items in distributor order
      dorder['items'] = [];
      for (var j in copy_dorder['items']) {
        var copy_item = copy_dorder['items'][j];
        var ditem = {};
        ditem['beverage_id'] = copy_item['id'];
        ditem['quantity'] = parseFloat(copy_item['quantity']);
        ditem['batch_cost'] = copy_item['batch_cost'];
        ditem['subtotal'] = copy_item['subtotal'];
        dorder['items'].push(ditem);
      }
      $scope.post_order['dist_orders'].push(dorder);
    }

    console.log($scope.post_order);

    $http.post('/purchase', {
      order: $scope.post_order['order'],
      distributor_orders: $scope.post_order['dist_orders'],
      do_send: false
    }).
    success(function(data, status, headers, config) {
      console.log(data);
      var URL = data['url'];
      $scope.reviewPurchaseOrders(URL, $scope.post_order);      
    }).
    error(function(data, status, headers, config) {

    });
  }

})

.controller('reviewPurchaseOrderModalCtrl', function($scope, $modalInstance, $http, $filter, pdf_url, post_order, read_only) {

  $scope.loadPdf = function() {
    var iframe = document.getElementById("pdf_embed");
    iframe.setAttribute("src", pdf_url);
  }
  
  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

  // read only hides the send button, and allows reviewing past purchase orders
  $scope.read_only = read_only;
  // disableSend temporarily disables the send button while the PDF is being
  // sent on the server
  $scope.disableSend = false;

  $scope.saveAndSend = function() {
    // This is called when the user is done reviewing the PDF files
    // and sends to all distributors.

    $scope.disableSend = true;
    $http.post('/purchase', {
      order: post_order['order'],
      distributor_orders: post_order['dist_orders'],
      do_send: true
    }).
    success(function(data, status, headers, config) {
      $scope.disableSend = false;
      $modalInstance.close(['save', null]);
    }).
    error(function(data, status, headers, config) {
      $scope.disableSend = false;
      $modalInstance.close(['error', null]);
    });

    
  };

});





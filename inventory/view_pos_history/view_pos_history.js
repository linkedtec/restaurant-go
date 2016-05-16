'use strict';

angular.module('myApp.viewPurchaseHistory', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewPurchaseHistory', {
      templateUrl: 'view_pos_history/view_pos_history.html',
      controller: 'ViewPurchaseHistoryCtrl'
    });
}])

.controller('ViewPurchaseHistoryCtrl', function($scope, $modal, $http, DateService, ItemsService) {

  $scope.showSpinner = false;

  $scope.searchPOControl = {};

  $scope.purchase_orders = [];

  $scope.startDateLocal = function() {
    return DateService.clientTimeToRestaurantTime($scope.start_date);
  };

  $scope.endDateLocal = function() {
    return DateService.clientTimeToRestaurantTime($scope.end_date);
  };

  $scope.searchByPO = function(query) {
    var po_num = query;
    if (po_num.length < 4) {
      swal({
        title: "Invalid PO Num",
        text: "The PO Num you provided is too short!  Please enter a valid PO num.",
        type: "warning",
        timer: 4000,
        allowOutsideClick: true});
    }

    $scope.showSpinner = true;

    var params = {
      po_num: po_num
    };
    $http.get('/purchase/po',
      {params: params})
    .success(function(data, status, headers, config) {

      $scope.showSpinner = false;

      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      $scope.purchase_orders = data;

      ItemsService.processPurchaseOrders($scope.purchase_orders);
      // return true to searchClickBox directive to highlight
      $scope.searchPOControl.activate();

    })
    .error(function(data, status, headers, config) {
      // return false to searchClickBox directive to inactivate highlight
      $scope.searchPOControl.deactivate();
      $scope.showSpinner = false;
    });
  };

  $scope.getPurchaseOrders = function() {

    $scope.showSpinner = true;

    var params = { 
      start_date: $scope.startDateLocal(),
      end_date: $scope.endDateLocal(),
      include_pending: false
    };
    $http.get('/purchase/all', 
      {params: params })
    .success(function(data, status, headers, config) {

      $scope.showSpinner = false;

      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      $scope.purchase_orders = data;

      ItemsService.processPurchaseOrders($scope.purchase_orders);

    })
    .error(function(data, status, headers, config) {
      $scope.showSpinner = false;
    });

  };

  $scope.initDate = function() {
    var today = new Date();
    $scope.start_date = new Date(today.setDate(today.getDate() - 6));
    $scope.start_date.setHours(0,0,0,0);
    $scope.end_date = new Date();
    $scope.end_date.setHours(23,59,59,999);

    $scope.getPurchaseOrders();
  };
  $scope.initDate();

  $scope.startDateChanged = function() {
    console.log($scope.start_date);

    $scope.searchPOControl.deactivate();

    $scope.getPurchaseOrders();
  };

  $scope.endDateChanged = function() {
    console.log($scope.end_date);

    $scope.searchPOControl.deactivate();

    $scope.getPurchaseOrders();
  };

  $scope.viewPurchaseOrder = function(purchase_order) {
    var params = { 
      id: purchase_order.order.id
    };
    $http.get('/purchase', 
      {params: params })
    .success(function(data, status, headers, config) {
      console.log(data);
      
      var modalEditInstance = $modal.open({
        templateUrl: 'reviewPurchaseOrderModal.html',
        controller: 'reviewPurchaseOrderModalCtrl',
        windowClass: 'review-purch-modal',
        backdropClass: 'white-modal-backdrop',
        backdrop : 'static',
        resolve: {
          content_type: function() {
            if (purchase_order.order.send_method==="email") {
              return "pdf";
            } else if (purchase_order.order.send_method==="text") {
              return "sms";
            } else {
              return "html";
            }
            
          },
          review_obj: function() {
            if (purchase_order.order.send_method==="email") {
              var URL = data['url'];
              return URL;
            } else if (purchase_order.order.send_method==="text") {
              return data;
            } else {
              var po = data;
              ItemsService.processPurchaseOrders([po]);
              return po;
            }
            
          },
          post_order: function() {
            return null;
          },
          read_mode: function() {
            return 'sent';
          },
          po_id: function() {
            return null;
          },
          send_later: function() {
            return false;
          }
        }
      });
    })
    .error(function(data, status, headers, config) {

    });
  };

  $scope.launchRecordDeliveryModal = function(dorder, is_edit) {
    var modalEditInstance = $modal.open({
      templateUrl: 'recordDeliveryModal.html',
      controller: 'recordDeliveryModalCtrl',
      windowClass: 'record-dlv-modal',
      backdropClass: 'white-modal-backdrop',
      backdrop : 'static',
      resolve: {
        dorder: function() {
          return dorder;
        },
        is_edit: function() {
          return is_edit;
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
            title: "Delivery Recorded!",
            text: "Your Delivery has been recorded and saved in the system.",
            type: "success",
            allowOutsideClick: true,
            html: true});

          for (var i in $scope.purchase_orders) {
            var po = $scope.purchase_orders[i];
            for (var j in po.distributor_orders) {
              var check_dorder = po.distributor_orders[j];
              if (check_dorder.id === dorder.id) {
                check_dorder.delivered = true;
                //$scope.$apply();
                break;
              }
            }
          }

        } else if (status === 'error') {
          swal({
            title: "Error Encountered!",
            text: "There was an error while trying to save your Delivery, please try again later.",
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

  $scope.editDelivery = function(dorder) {
    console.log(dorder);

    var params = {
      id: dorder.id
    };

    $http.get('/deliveries',
      {params: params})
    .success(function(data, status, headers, config) {

      console.log('edit delivery:');
      console.log(data);
      if (data===null) {
        return;
      }

      // need to combine returned delivery data into the input dorder to form
      // a combined dorder ready for editing
      dorder['delivery_timely'] = data['delivery_timely'];
      dorder['delivery_invoice'] = data['delivery_invoice'];
      dorder['delivery_invoice_acceptable'] = data['delivery_invoice_acceptable'];
      var dlv_time = DateService.getDateFromUTCTimeStamp(
            data['delivery_time'], true);
      var dlv_date = DateService.getDateFromUTCTimeStamp(
            data['delivery_time'], true);
      dlv_date.setHours(0,0,0,0)
      dorder['delivery_time'] = dlv_time;
      dorder['delivery_date'] = dlv_date;
      dorder['additional_notes'] = data['additional_notes'];
      dorder['invoice_num'] = data['invoice_num'];

      for (var i in dorder.items) {
        var item = dorder.items[i];
        var dlv_item = null;
        for (var j in data['items']) {
          if (data['items'][j]['beverage_id'] == item.beverage_id) {
            dlv_item = data['items'][j];
            break;
          }
        }
        if (dlv_item===null) {
          continue;
        }
        item['satisfactory'] = dlv_item['satisfactory'];
        item['dlv_quantity'] = dlv_item['dlv_quantity'];
        item['dlv_invoice'] = dlv_item['dlv_invoice'];
        item['dlv_discount_applied'] = dlv_item['dlv_discount_applied'];
        item['dlv_wholesale'] = dlv_item['dlv_wholesale'];
        item['dlv_update_wholesale'] = dlv_item['dlv_update_wholesale'];
        item['dlv_damaged_goods'] = dlv_item['dlv_damaged_goods'];
        item['dlv_rough_handling'] = dlv_item['dlv_rough_handling'];
        item['dlv_wrong_item'] = dlv_item['dlv_wrong_item'];
        item['dlv_comments'] = dlv_item['dlv_comments'];
      }

      $scope.launchRecordDeliveryModal(dorder, true);

    })
    .error(function(data, status, headers, config) {

    });
  };

  $scope.promptDeleteDistOrder = function(porder, dorder) {
    swal({
      title: "Delete this Distributor Order?",
      text: "This will remove all records of this Distributor Order, and the budgetary change will be reflected in your Monthly Budget and Margins calculations.  Are you absolutely sure?",
      type: "warning",
      showCancelButton: true,
      html: true,
      confirmButtonColor: "#cc2200",
      confirmButtonText: "Yes, delete it!",
      closeOnConfirm: true },
      function() {
        $scope.deleteDistOrder(porder, dorder);
    });
  };

  $scope.deleteDistOrder = function(porder, dorder) {
    console.log("DELETE DIST ORDER");

    $http.delete('/purchase/dorder', {
        params: {
          do_id: dorder.id
        }
      }).
      success(function(data, status, headers, config) {
        console.log(data)
        
        // Re-query POs in date range
        $scope.getPurchaseOrders();

      }).
      error(function(data, status, headers, config) {
        console.log(data);
      });
  };

  $scope.recordDelivery = function(order, dorder, is_edit) {
    console.log(order);

    var params = { 
      id: order['order'].id,
      // view_override will access the purchase as 'save only' to get a 
      // comprehensive order returned
      view_override: "save"
    };

    // first get the full distributor_order from the server
    $http.get('/purchase', 
      {params: params })
    .success(function(data, status, headers, config) {

      console.log('record delivery:');
      console.log(data);
      if (data===null) {
        return;
      }

      ItemsService.processPurchaseOrders([data]);

      // data returned is the ENTIRE purchase order, need to only pass the
      // distributor order
      var pass_dorder;
      for (var i in data.distributor_orders) {
        var check_dorder = data.distributor_orders[i];
        if (check_dorder.id===dorder.id) {
          pass_dorder = check_dorder;
          break;
        }
      }
      ItemsService.processBevsForAddable(pass_dorder.items);
      if (is_edit===true) {
        $scope.editDelivery(pass_dorder);
      } else {
        $scope.launchRecordDeliveryModal(pass_dorder, false);
      }

    })
    .error(function(data, status, headers, config) {

    });
  };


})

.controller('recordDeliveryModalCtrl', function($scope, $modalInstance, $http, dorder, is_edit) {

  $scope.dist_order = dorder;
  $scope.is_edit = is_edit;
  console.log($scope.dist_order);

  $scope.closeOnSave = function() {

    $modalInstance.close(['save', $scope.dist_order]);
  };

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };


});
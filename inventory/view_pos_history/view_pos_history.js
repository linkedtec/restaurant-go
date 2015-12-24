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

  $scope.purchase_orders = [];

  $scope.startDateLocal = function() {
    return DateService.clientTimeToRestaurantTime($scope.start_date);
  };

  $scope.endDateLocal = function() {
    return DateService.clientTimeToRestaurantTime($scope.end_date);
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
      $scope.purchase_orders = data;

      ItemsService.processPurchaseOrders($scope.purchase_orders);

    })
    .error(function(data, status, headers, config) {

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

    $scope.getPurchaseOrders();
  };

  $scope.endDateChanged = function() {
    console.log($scope.end_date);

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

  $scope.launchRecordDeliveryModal = function(dorder) {
    var modalEditInstance = $modal.open({
      templateUrl: 'recordDeliveryModal.html',
      controller: 'recordDeliveryModalCtrl',
      windowClass: 'record-dlv-modal',
      backdropClass: 'white-modal-backdrop',
      backdrop : 'static',
      resolve: {
        dorder: function() {
          return dorder;
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
  }

  $scope.recordDelivery = function(dorder) {
    console.log(dorder);

    var params = { 
      id: dorder.id
    };

    // first get the full distributor_order from the server
    $http.get('/purchase/dorder', 
      {params: params })
    .success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      $scope.launchRecordDeliveryModal(data);

    })
    .error(function(data, status, headers, config) {

    });
  };


})

.controller('recordDeliveryModalCtrl', function($scope, $modalInstance, $http, dorder) {

  $scope.dist_order = dorder;
  console.log($scope.dist_order);

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };


});
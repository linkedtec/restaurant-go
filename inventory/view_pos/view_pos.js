'use strict';

angular.module('myApp.viewPurchaseOrders', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewPurchaseOrders', {
      templateUrl: 'view_pos/view_pos_new.html',
      controller: 'ViewPurchaseOrdersCtrl'
    });
}])

.controller('ViewPurchaseOrdersCtrl', function($scope, $modal, $http, ContactService, DateService, ItemsService) {


  // XXX testing timezone fix
  console.log(DateService.getRestaurantTimezone());
  console.log(DateService.getRestaurantTimezoneOffset());
  console.log(DateService.getClientTimezoneOffset());
  var now = new Date();
  console.log(now);
  console.log(DateService.clientTimeToRestaurantTime(now));
  console.log(now);

  $scope.pending_orders = [];

  $scope.createNewPO = function() {
    var modalEditInstance = $modal.open({
      templateUrl: 'createPurchaseOrderModal.html',
      controller: 'createPurchaseOrderModalCtrl',
      windowClass: 'record-dlv-modal',
      backdropClass: 'dark-blue-modal-backdrop',
      backdrop : 'static',
      resolve: {

      }
    });

    modalEditInstance.result.then(
      // success status
      function( result ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is the affected beverage
        var status = result[0];
        
        $scope.getPendingPOs();

      }, 
      // error status
      function() {

      });
  };

  $scope.calculateDates = function(po) {
    var order_date = null;
    var today = new Date();
    today.setHours(0,0,0,0);

    po.order['order_date'] = DateService.getDateFromUTCTimeStamp(po.order['order_date'], true);
    console.log(po.order['order_date']);

    if (DateService.isValidDate(po.order['order_date'])) {
      order_date = po.order['order_date'];
      order_date.setHours(0,0,0,0);
      if (order_date > today) {
        po.order['upcoming'] = true;
        po.order['days_til_send'] = Math.abs(DateService.daysBetween(today, order_date));
      } else {
        po.order['upcoming'] = false;
        po.order['days_til_send'] = 0;
      }
    } else {
      po.order['upcoming'] = false;
      po.order['days_til_send'] = null;
    }
  };

  $scope.getPendingPOs = function() {
    $http.get('/purchase/pending').
    success(function(data, status, headers, config) {
      console.log(data);

      $scope.pending_orders = data;
      ItemsService.processPurchaseOrders($scope.pending_orders);

      for (var i in $scope.pending_orders) {
        var order = $scope.pending_orders[i];
        $scope.calculateDates(order);
      }
      console.log($scope.pending_orders);
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getPendingPOs();

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
            } else {
              data.order['order_date_pretty'] = DateService.getPrettyDate(data.order['order_date'], true, true);
              return data;
            }
            
          },
          post_order: function() {
            return null;
          },
          read_mode: function() {
            return 'pending';
          }
        }
      });

    })
    .error(function(data, status, headers, config) {

    });
  };

  $scope.deletePendingPO = function(index) {

    var po = $scope.pending_orders[index];

    swal({
      title: "Delete Purchase Order?",
      text: "This will delete Order #<b>" + po.order.po_num + "</b> and remove it from the Pending list.  This cannot be undone.",
      type: "warning",
      showCancelButton: true,
      html: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, delete it!",
      closeOnConfirm: false },
      function() {
        $http.delete('/purchase/pending', {
          params: {
            id:po.order.id
          }
        }).
        success(function(data, status, headers, config) {
          $scope.getPendingPOs();
          swal({
            title: "Purchase Order Deleted!",
            text: "The Pending PO has been deleted and will not be sent to Distributors or recorded in the system.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true
          });
        }).
        error(function(data, status, headers, config) {
          console.log(data);
        });
    });
  }

})

.controller('createPurchaseOrderModalCtrl', function($scope, $modalInstance) {

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

  $scope.closeOnSave = function() {
    $modalInstance.close(['save', null]);
  };

})

.controller('reviewPurchaseOrderModalCtrl', function($scope, $modalInstance, $http, $filter, $sce, content_type, review_obj, post_order, read_mode) {

  $scope.trustAsHtml = $sce.trustAsHtml;

  $scope.content_type = content_type;
  // read only hides the send button, and allows reviewing past purchase orders
  $scope.read_mode = read_mode;
  // disableSend temporarily disables the send button while the PDF is being
  // sent on the server
  $scope.disableSend = false;
  $scope.review_obj = review_obj;

  if ($scope.content_type==="sms") {
    for (var i in $scope.review_obj) {
      var dist_sms = $scope.review_obj[i];
      dist_sms['content'] = dist_sms['content'].replace(/\n/g, '<br/>');
    }
  }

  $scope.loadPdf = function() {

    if ($scope.content_type !== "pdf") {
      return;
    }

    var pdf_url = $scope.review_obj;
    var iframe = document.getElementById("pdf_embed");
    iframe.setAttribute("src", pdf_url);
  };
  
  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

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

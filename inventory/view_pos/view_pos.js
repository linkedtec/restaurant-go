'use strict';

angular.module('myApp.viewPurchaseOrders', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewPurchaseOrders', {
      templateUrl: 'view_pos/view_pos_new.html',
      controller: 'ViewPurchaseOrdersCtrl'
    });
}])

.controller('ViewPurchaseOrdersCtrl', function($scope, $modal, $http, ContactService, DateService, ItemsService, UserService) {

  $scope.pending_orders = [];

  $scope.createNewPO = function() {
    var modalEditInstance = $modal.open({
      templateUrl: 'createPurchaseOrderModal.html',
      controller: 'createPurchaseOrderModalCtrl',
      windowClass: 'record-dlv-modal',
      backdropClass: 'gray-modal-backdrop',
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
      UserService.checkAjaxLoginRequired(data);
    });
  };
  $scope.getPendingPOs();

  $scope.sendNowConfirm = function(purchase_order) {
    swal({
      title: "Review & Send Order?",
      text: "This will send the Purchase Order to Distributors right away, and remove it from the Pending list.  You will have a chance to review the PO before we send it.  Proceed?",
      type: "warning",
      showCancelButton: true,
      html: true,
      confirmButtonColor: "#51a351",
      confirmButtonText: "Yes, review now!",
      closeOnConfirm: true },
      function() {
        $scope.viewPurchaseOrder(purchase_order, true);
      });
  };

  $scope.viewPurchaseOrder = function(purchase_order, sendable) {
    var params = { 
      id: purchase_order.order.id
    };
    // if the reviewed PO is sendable, that means we're trying to 'Send Now'
    // on a pending PO, so override order_date to current time
    if (sendable===true) {
      // do NOT call DateService.clientTimeToRestaurantTime here because
      // we're not sending a SET date, we're sending a NOW date
      params['order_date_override'] = new Date();
    }
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
            if (sendable===true) {
              return 'send';
            } else {
              return 'pending';
            }
          },
          po_id: function() {
            return purchase_order.order.id;
          },
          send_later: function() {
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
            var swal_title="Purchase Orders Sent!";
            var swal_content="Your Purchase Order(s) were sent to your Distributors!  You can view past orders in the Purchase History page.";
            swal({
              title: swal_title,
              text: swal_content,
              type: "success",
              allowOutsideClick: true,
              html: true});

          } else if (status === 'error') {
            swal({
              title: "Error Encountered!",
              text: "There was an error sending your Purchase Orders, please try again later.",
              type: "error",
              allowOutsideClick: true,
              html: true});
          }
          
          $scope.getPendingPOs();

        }, 
        // error status
        function() {

        });

    })
    .error(function(data, status, headers, config) {
      UserService.checkAjaxLoginRequired(data);
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
          UserService.checkAjaxLoginRequired(data);
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

.controller('reviewPurchaseOrderModalCtrl', function($scope, $modalInstance, $http, $filter, $sce, ItemsService, UserService, content_type, review_obj, post_order, read_mode, po_id, send_later) {

  $scope.trustAsHtml = $sce.trustAsHtml;

  $scope.content_type = content_type;
  // read only hides the send button, and allows reviewing past purchase orders
  $scope.read_mode = read_mode;
  // disableSend temporarily disables the send button while the PDF is being
  // sent on the server
  $scope.disableSend = false;
  $scope.review_obj = review_obj;

  // if po_id is null, there is no existing PO on server
  // if po_id is not null, there is an existing PO on server, and this is
  // the case if we're doing Send Now on a pending PO
  $scope.po_id = po_id;

  $scope.send_later = send_later;

  if ($scope.content_type==="sms") {
    for (var i in $scope.review_obj) {
      var dist_sms = $scope.review_obj[i];
      dist_sms['content'] = dist_sms['content'].replace(/\n/g, '<br/>');
    }
  }

  // for displaying HTML for review without saving, we want to generate
  // short snippets describing additional pricing on items, if any
  if ($scope.content_type==="html") {
    for (var i in $scope.review_obj.distributor_orders) {
      var dorder = $scope.review_obj.distributor_orders[i];
      for (var j in dorder.items) {
        var item = dorder.items[j];
        item['additional_pricing_short'] = ItemsService.getAdditionalPricingShortDescription(
          item['additional_pricing'],
          item['container_type'],
          item['purchase_count'],
          false);
      }
    }
  }

  // resolve the display caption and button titles
  if ($scope.read_mode==='send') {
    if ($scope.content_type==='pdf') {
      if ($scope.send_later===true) {
        $scope.send_caption="Please review the PDFs below before adding to Pending Orders.";
        $scope.send_btn="Save & Send Later";
      } else {
        $scope.send_caption="Please review the PDFs below before emailing to Distributor(s).";
        $scope.send_btn="Save & Email to Distributors";
      }
    } else if ($scope.content_type==='sms') {
      if ($scope.send_later===true) {
        $scope.send_caption="Please review the SMS below before adding to Pending Orders.";
        $scope.send_btn="Save & Send Later";
      } else {
        $scope.send_caption="Please review the SMS below before texting to Distributor(s).";
        $scope.send_btn="Save & Text to Distributors";
      }
    } else if ($scope.content_type==='html') {
      $scope.send_caption="Please review the order below before saving in our records.";
      $scope.send_btn="Save in Purchase History";
    }
  } else if ($scope.read_mode==='sent') {
    if ($scope.content_type==='pdf') {
      $scope.send_caption="You are reviewing PDFs which have already been emailed to Distributor(s).";
    } else if ($scope.content_type==='sms') {
      $scope.send_caption="You are reviewing SMS which have already been texted to Distributor(s).";
    } else if ($scope.content_type==='html') {
      $scope.send_caption="You are reviewing a record which was saved but not sent to Distributors.";
    }
  } else if ($scope.read_mode==='pending') {
    if ($scope.content_type==='pdf') {
      $scope.send_caption="You are reviewing a pending PDF which will be emailed to Distributor(s).";
    } else if ($scope.content_type==='sms') {
      $scope.send_caption="You are reviewing a pending SMS which will be texted to Distributor(s).";
    }
  } else {
    $scope.send_caption="";
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

    // 'Send Now' for pending POs sends via a saved purchase order ID
    // on the server, so we don't post client objects to send.
    if ($scope.po_id !== null) {
      $http.post('/purchase/pending', {
        id: $scope.po_id
      }).
      success(function(data, status, headers, config) {
        $scope.disableSend = false;
        $modalInstance.close(['save', $scope.send_later]);
      }).
      error(function(data, status, headers, config) {
        $scope.disableSend = false;
        $modalInstance.close(['error', null]);
        UserService.checkAjaxLoginRequired(data);
      });
    } 
    // other POs do not have DB entries and we need to post the post_order
    else {
      $http.post('/purchase', {
        order: post_order['order'],
        distributor_orders: post_order['dist_orders'],
        do_send: true
      }).
      success(function(data, status, headers, config) {
        $scope.disableSend = false;
        $modalInstance.close(['save', $scope.send_later]);
      }).
      error(function(data, status, headers, config) {
        $scope.disableSend = false;
        $modalInstance.close(['error', null]);
        UserService.checkAjaxLoginRequired(data);
      });
    }
    
  };

});

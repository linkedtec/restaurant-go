'use strict';

angular.module('myApp.viewPurchaseOrders', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewPurchaseOrders', {
      templateUrl: 'view_pos/view_pos_new.html',
      controller: 'ViewPurchaseOrdersCtrl'
    });
}])

.controller('ViewPurchaseOrdersCtrl', function($scope, $modal, $http, ContactService, DateService) {

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
        
        // after a save, we want to show a success dialogue with an optional
        // CC email address
        if (status === 'save') {
          $scope.getPendingPOs();
        } else if (status === 'error') {

        }

      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.getPendingPOs = function() {
    $http.get('/purchase/pending').
    success(function(data, status, headers, config) {
      console.log(data);
      if (data !== null) {
        $scope.pending_orders = data;

        for (var i in $scope.pending_orders) {
          var po = $scope.pending_orders[i];

          var date_str = po.order['order_date'];
          $scope.pending_orders[i]['order_date_pretty'] = DateService.getPrettyDate(date_str, true, true);
        }
      } else {
        $scope.pending_orders = [];
      }
      
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getPendingPOs();

})

.controller('createPurchaseOrderModalCtrl', function($scope, $modalInstance) {

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

})

.controller('reviewPurchaseOrderModalCtrl', function($scope, $modalInstance, $http, $filter, $sce, content_type, review_obj, post_order, read_only) {

  $scope.trustAsHtml = $sce.trustAsHtml;

  $scope.content_type = content_type;
  // read only hides the send button, and allows reviewing past purchase orders
  $scope.read_only = read_only;
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

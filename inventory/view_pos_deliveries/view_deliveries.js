'use strict';

angular.module('myApp.viewDeliveries', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewDeliveries', {
      templateUrl: 'view_pos_deliveries/view_deliveries.html',
      controller: 'ViewDeliveriesCtrl'
    });
}])

.controller('ViewDeliveriesCtrl', function($scope, $modal, $http, DateService, MathService, DistributorsService, DeliveriesService) {

  $scope.show_add_ui = false;

  $scope.distributors = null;

  $scope.addDeliveryControl = {};

  $scope.deliveries = [];

  $scope.initDate = function() {
    var today = new Date();
    $scope.start_date = new Date(today.setDate(today.getDate() - 6));
    $scope.start_date.setHours(0,0,0);
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
    var result = DeliveriesService.get(
      $scope.startDateLocal(),
      $scope.endDateLocal(),
      DateService.timeZoneOffset(),
      null
      );
    result.then(
      function(payload) {
        console.log(payload.data);
        var deliveries = [];

        if (payload.data!==null && payload.data!=="null") {
          deliveries = payload.data;
        }

        for (var i in deliveries) {
          var dlv = deliveries[i];
          
          // convert date and time from utc timestamp to local time object
          dlv['delivery_date'] = DateService.getDateFromUTCTimeStamp(
            dlv['delivery_time'], true);
          dlv['delivery_time'] = new Date(dlv['delivery_time']);

          var date_str = dlv['delivery_time'].toString();
          dlv['pretty_date'] = DateService.getPrettyDate(date_str, false);

          // get the sum of item values for the delivery
          var inv_sum = 0;
          for (var j in dlv.delivery_items) {
            inv_sum += dlv.delivery_items[j].value;
          }
          dlv['inv_sum'] = inv_sum;

          // placeholder for distributor_obj in case of editing
          dlv['distributor_obj'] = null;
        }

        console.log(deliveries);

        $scope.deliveries = deliveries;

      },
      function(errorPayload) {
        ; // do nothing for now
      });

  };
  $scope.getDeliveries();

  $scope.getBevUnitCost = function(inv) {
    // locally calculate unit_cost for sorting purposes
    var purchase_cost = 0;
    var purchase_count = 1;
    var deposit = 0;
    if (inv['purchase_cost'] !== null) {
      purchase_cost = inv['purchase_cost'];
    }
    if (inv['purchase_count'] !== null) {
      purchase_count = inv['purchase_count'];
    }
    if (inv['deposit'] !== null) {
      deposit = inv['deposit'];
    }
    return purchase_cost / purchase_count + deposit;
  };

  $scope.editDelivery = function(delivery) {

    // first prep the delivery for editing by converting some attributes 
    // to play nice with the delivery directive.
    // first, add a distributor_obj attr for client-side distributor info
    var found_dist = false;
    for (var i in $scope.distributors) {
      var dist = $scope.distributors[i];
      if (delivery.distributor_id===dist.id) {
        delivery.distributor_obj = dist;
        break;
      }
    }
    // fix the floating point numbers to 2 decimal places for numbers
    // which might have overly long floating points
    delivery['inv_sum'] = MathService.fixFloat2(delivery['inv_sum']);
    // for each of the delivery items, fix the quantity and value!
    for (var i in delivery.delivery_items) {
      var item = delivery.delivery_items[i];
      item['quantity'] = MathService.fixFloat2(item['quantity']);
      item['value'] = MathService.fixFloat2(item['value']);
      item['unit_cost'] = $scope.getBevUnitCost(item);

      // we use 'id' to compare against GET /inv bevs, not 'beverage_id'
      item['id'] = item['beverage_id'];
    }

    console.log(delivery);

    var modalEditInstance = $modal.open({
      templateUrl: 'startDlvModal.html',
      controller: 'startDlvModalCtrl',
      windowClass: 'start-inv-modal',
      backdropClass: 'blue-modal-backdrop',
      resolve: {
        edit_delivery: function() {
          return delivery;
        },
        distributors: function() {
          return $scope.distributors;
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
        var edit_delivery = result[1];
        
        if (status === 'delete') {
          var delivery_index = $scope.deliveries.indexOf(edit_delivery);
          if (delivery_index > -1) {
            $scope.deliveries.splice(delivery_index, 1);
          }
          swal({
            title: "Delivery Deleted!",
            text: "The delivery has been removed from the system.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
        }
        else if (status === 'save') {
          console.log(edit_delivery);

          swal({
            title: "Delivery Updated!",
            text: "The delivery has been updated with your changes.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});

          $scope.getDeliveries();
        }
      }, 
      // error status
      function() {
        ;
      });

  };

  $scope.emailSpreadsheet = function(email) {
    $scope.exportSpreadsheet(email);
  };

  $scope.exportSpreadsheet = function( email ) {
    console.log("export spreadsheet");

    if (email===undefined) {
      email = null;
    }

    var export_format = 'xlsx';

    var result = DeliveriesService.get(
      $scope.startDateLocal(),
      $scope.endDateLocal(),
      DateService.timeZoneOffset(),
      export_format,
      email
      );
    result.then(
      function(payload) {
        console.log(payload.data);
        if (email !== null) {

        } else {
          // for downloading, not email
          var URL = payload.data['url'];
          // create an iframe to download the file at the url
          var iframe = document.createElement("iframe");
          iframe.setAttribute("src", URL);
          iframe.setAttribute("style", "display: none");
          document.body.appendChild(iframe);
        }
      },
      function(errorPayload) {
        ; // do nothing for now
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

  $scope.getDistributors();

  $scope.reSort = function() {
    $scope.deliveries.sort(function(a, b) {
      var keyA = a['delivery_time'];
      var keyB = b['delivery_time'];

      return keyB - keyA;
    });
  };

  $scope.startDateChanged = function() {
    console.log($scope.start_date);

    $scope.getDeliveries();
  };

  $scope.endDateChanged = function() {
    console.log($scope.end_date);

    $scope.getDeliveries();
  };

  $scope.startDelivery = function() {

    var modalStartInstance = $modal.open({
      templateUrl: 'startDlvModal.html',
      controller: 'startDlvModalCtrl',
      windowClass: 'start-inv-modal',
      backdropClass: 'gray-modal-backdrop',
      size: 'lg',
      backdrop : 'static',
      resolve: {
        edit_delivery: function() {
          return null;
        },
        distributors: function() {
          return $scope.distributors;
        }
      }
    });

    modalStartInstance.result.then(
      // success status
      function( result ) {
        var status = result[0];
        var data = result[1];
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is beverage id
        if (status === 'cancel') {
          ;
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (status === 'save') {
          $scope.getDeliveries();
        }
      }, 
      // error status
      function() {
        ;
      });

  };

})

.controller('startDlvModalCtrl', function($scope, $modalInstance, $filter, distributors, edit_delivery) {

  $scope.distributors = distributors;
  $scope.edit_delivery = null;
  if (edit_delivery !== undefined && edit_delivery !== null) {
    $scope.edit_delivery = edit_delivery;
  }

  $scope.startDlvControl = {};

  $scope.startDlvControl.cancel = function() {
    $scope.cancel();
  };

  $scope.cancel = function() {
    console.log("cancel");
    $modalInstance.dismiss('cancel');
  };

  $scope.closeOnSave = function(new_delivery) {
    console.log('close on save');
    console.log(new_delivery);
    $modalInstance.close(['save', new_delivery]);
  };

  $scope.closeOnDelete = function() {
    console.log("close on delete");
    $modalInstance.close(['delete', $scope.edit_delivery]);
  };

})

.controller('editDelivModalCtrl', function($scope, $modalInstance, $filter, MathService, DateService, edit_delivery, distributors) {

  $scope.edit_delivery = edit_delivery;
  $scope.distributors = distributors;

  $scope.editDelivControl = {};

  $scope.editDelivControl.cancel = function() {
    $scope.cancel();
  };

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

  $scope.closeOnSave = function(new_delivery) {
    // clone our tmp beverage to the original beverage object to commit the
    // changes on the client side.

    // transfers updated values to the local client delivery entry
    for (var key in new_delivery) {
      if ($scope.edit_delivery.hasOwnProperty(key)) {
        $scope.edit_delivery[key] = new_delivery[key];
      }
    }

    // get the pretty date from the updated delivery time
    var date_str = $scope.edit_delivery['delivery_time'].toString();
    $scope.edit_delivery['pretty_date'] = DateService.getPrettyDate(date_str, false);

    $modalInstance.close(['save', $scope.edit_delivery]);
  };

  $scope.closeOnDelete = function() {
    console.log("close on delete");
    $modalInstance.close(['delete', $scope.edit_delivery]);
  };

});
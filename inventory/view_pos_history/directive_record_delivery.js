angular.module('myApp')

.directive('recordDelivery', function($modal, $http, $timeout, MathService, DateService, DeliveriesService, ItemsService) {
  return {
    restrict: 'AE',
    scope: {
      distOrder: '=',   // if we're using this to edit instead of create new beverage
      closeOnSave: '&',
      closeOnCancel: '&',
      closeOnDelete: '&',
      control: '='
    },
    templateUrl: './view_pos_history/template_record_delivery.html',
    link: function(scope, elem, attrs) {

      scope.invoice = {'value':null};

      scope.internalControl = scope.control || {};
      
      scope.delivery_time = null;
      scope.delivery_date = null;

      scope.dlv_timely = {'value':null};
      scope.dlv_invoice = {'value':null};
      scope.dlv_invoice_acceptable = {'value':null};

      scope.dlv_additional_notes = {'value': null};

      scope.new_failure_msg = null;

      console.log(scope.distOrder);
      
      // do preloading of delivery variables if scope.distOrder was passed in
      // for editing
      if (scope.distOrder['delivery_invoice']!==undefined && scope.distOrder['delivery_invoice']!==null) {
        scope.dlv_invoice.value = scope.distOrder['delivery_invoice'];
        scope.dlv_timely.value = scope.distOrder['delivery_timely'];
        scope.dlv_invoice_acceptable.value = scope.distOrder['delivery_invoice_acceptable'];
        scope.delivery_date = scope.distOrder['delivery_date'];
        scope.delivery_time = scope.distOrder['delivery_time'];
        scope.dlv_additional_notes.value = scope.distOrder['additional_notes'];

      } else {
        // if there was no preloading, init delivery params on item
        for (var i in scope.distOrder.items) {
          var item = scope.distOrder.items[i];
          item['satisfactory'] = null;
          item['dlv_quantity'] = null;
          item['dlv_invoice'] = null;
          item['dlv_has_notes'] = false; // just a convenience param for tracking whether client added notes
        }
      }

      scope.addAdditionalNote = function() {
        scope.dlv_additional_notes.value = '';
      };

      scope.flagInvoice = function(item) {
        scope.launchFlagInvoiceModal(item);
      };

      scope.flagQuantity = function(item) {
        scope.launchFlagQuantityModal(item);
      };

      scope.addNotes = function(item) {
        scope.launchAdditionalNotesModal(item);
      };

      scope.save = function() {
        scope.form_ver = {
          error_dlv_timely: false,
          error_dlv_invoice: false,
          error_dlv_invoice_acceptable: false,
          error_dlv_missing_items: false
        };
        scope.new_failure_msg = null;

        var all_clear = true;

        if (scope.dlv_timely.value===null) {
          all_clear = false;
          scope.form_ver.error_dlv_timely = true;
        }

        if (scope.dlv_invoice.value===null) {
          all_clear = false;
          scope.form_ver.error_dlv_invoice = true;
        }

        if (scope.dlv_invoice_acceptable.value===null) {
          all_clear = false;
          scope.form_ver.error_dlv_invoice_acceptable = true;
        }

        // make sure all items' satisfactory has been checked
        for (var i in scope.distOrder.items) {
          var item = scope.distOrder.items[i];
          if (item.satisfactory!==true && item.satisfactory!==false) {
            all_clear = false;
            item['error_satisfactory'] = true;
          } else {
            item['error_satisfactory'] = false;
          }
        }

        if (all_clear!==true) {
          scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
          return;
        }

        var post_order = {};
        post_order['do_id'] = scope.distOrder.id;
        // combine delivery time and date into one date object
        var post_delivery_time = scope.delivery_date;
        post_delivery_time.setHours(
          scope.delivery_time.getHours(),
          scope.delivery_time.getMinutes(),
          scope.delivery_time.getSeconds(),
          0);
        post_order['delivery_time'] = post_delivery_time;
        post_order['delivery_timely'] = scope.dlv_timely.value;
        post_order['delivery_invoice'] = scope.dlv_invoice.value;
        post_order['delivery_invoice_acceptable'] = scope.dlv_invoice_acceptable.value;
        post_order['items'] = [];
        for (var i in scope.distOrder.items) {
          var copy_item = scope.distOrder.items[i];
          var new_item = {};
          new_item['beverage_id'] = copy_item['beverage_id'];
          new_item['dlv_quantity'] = copy_item['dlv_quantity'];
          new_item['dlv_invoice'] = copy_item['dlv_invoice'];
          new_item['dlv_wholesale'] = copy_item['dlv_wholesale'];
          new_item['dlv_update_wholesale'] = copy_item['dlv_update_wholesale'];
          new_item['dlv_discount_applied'] = copy_item['dlv_discount_applied'];
          new_item['dlv_rough_handling'] = copy_item['dlv_rough_handling'];
          new_item['dlv_damaged_goods'] = copy_item['dlv_damaged_goods'];
          new_item['dlv_wrong_item'] = copy_item['dlv_wrong_item'];
          new_item['dlv_comments'] = null;
          if (copy_item['dlv_comments']!==undefined && copy_item['dlv_comments']!==null && copy_item['dlv_comments'].length > 0 && copy_item['dlv_comments']!==' ') {
            new_item['dlv_comments'] = copy_item['dlv_comments'];
          } 
          new_item['satisfactory'] = copy_item['satisfactory'];
          post_order['items'].push(new_item);
        }
        post_order['additional_notes'] = null;
        if (scope.dlv_additional_notes.value!==null && scope.dlv_additional_notes.value.length>0 && scope.dlv_additional_notes.value!==' ') {
          post_order['additional_notes'] = scope.dlv_additional_notes.value;
        }
        console.log('POST ORDER');
        console.log(post_order);
        $http.post('/deliveries', {
          do_id: post_order['do_id'],
          delivery_time: post_order['delivery_time'],
          delivery_timely: post_order['delivery_timely'],
          delivery_invoice: post_order['delivery_invoice'],
          delivery_invoice_acceptable: post_order['delivery_invoice_acceptable'],
          items: post_order['items'],
          additional_notes: post_order['additional_notes']
        }).
        success(function(data, status, headers, config) {
          console.log(data);

        }).
        error(function(data, status, headers, config) {

        });

      }

      scope.launchFlagQuantityModal = function(item) {
        var modalEditInstance = $modal.open({
          templateUrl: 'dlvFlagQuantityModalCtrl.html',
          controller: 'dlvFlagQuantityModalCtrl',
          windowClass: 'inv-qty-modal',
          backdropClass: 'white-modal-backdrop',
          //backdrop : 'static',
          resolve: {
            item: function() {
              return item;
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

          }, 
          // error status
          function() {
            ;
          });
      };

      scope.launchFlagInvoiceModal = function(item) {
        var modalEditInstance = $modal.open({
          templateUrl: 'dlvFlagInvoiceModalCtrl.html',
          controller: 'dlvFlagInvoiceModalCtrl',
          windowClass: 'inv-qty-modal-hi',
          backdropClass: 'white-modal-backdrop',
          backdrop : 'static',
          resolve: {
            item: function() {
              return item;
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

          }, 
          // error status
          function() {
            ;
          });
      };

      scope.launchAdditionalNotesModal = function(item) {
        var modalEditInstance = $modal.open({
          templateUrl: 'dlvAddNotesModalCtrl.html',
          controller: 'dlvAddNotesModalCtrl',
          windowClass: 'inv-qty-modal',
          backdropClass: 'white-modal-backdrop',
          backdrop : 'static',
          resolve: {
            item: function() {
              return item;
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

          }, 
          // error status
          function() {
            ;
          });
      };

    }
  }
})

.controller('dlvFlagQuantityModalCtrl', function($scope, $modalInstance, $http, item, MathService) {

  $scope.item = item;
  console.log($scope.item);

  $scope.dlv_quantity = {'value':null};
  $scope.new_failure_msg = null;
  $scope.loaded_existing = false;

  // init, check if item coming in already has a flag
  if ($scope.item['dlv_quantity']!==undefined && $scope.item['dlv_quantity']!==null) {
    $scope.dlv_quantity.value = $scope.item['dlv_quantity'];
    $scope.loaded_existing = true;
  }

  $scope.saveFlag = function() {
    $scope.form_ver = {
      error_dlv_quantity: false
    };
    $scope.new_failure_msg = null;

    var all_clear = true;
    if ($scope.dlv_quantity.value === null || MathService.numIsInvalidOrNegative($scope.dlv_quantity.value)) {
      all_clear = false;
      $scope.form_ver.error_dlv_quantity=true;
      $scope.new_failure_msg = "Please enter a valid delivered quantity.";
    }

    if ($scope.dlv_quantity.value===$scope.item['quantity']) {
      all_clear = false;
      $scope.form_ver.error_dlv_quantity=true;
      $scope.new_failure_msg = "The delivery quantity matches the ordered quantity!  Only flag this item if the delivered quantity mismatches the number ordered.";
    }

    if (all_clear !== true) {
      return;
    }

    $scope.item['dlv_quantity'] = $scope.dlv_quantity.value;
    $modalInstance.close(['save', $scope.item]);
  };

  $scope.deleteFlag = function() {
    if ($scope.item['dlv_quantity']!==undefined) {
      $scope.item['dlv_quantity'] = null;
    }

    $modalInstance.close(['delete', $scope.item]);
  };

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

})

.controller('dlvFlagInvoiceModalCtrl', function($scope, $modalInstance, $http, item, ItemsService, MathService) {

  $scope.item = item;
  console.log($scope.item);

  $scope.item['additional_pricing_short'] = ItemsService.getAdditionalPricingShortDescription(
    $scope.item['additional_pricing'],
    $scope.item['container_type'],
    $scope.item['purchase_count'],
    false);

  $scope.dlv_invoice = {'value':null};
  $scope.dlv_wholesale = {'value':null};
  $scope.dlv_update_wholesale = {'value':true};
  $scope.dlv_discount_applied = {'value':null};
  $scope.new_failure_msg = null;
  $scope.loaded_existing = false;

  // init, check if item coming in already has a flag.  Since dlv_invoice is
  // required for flagging invoice, just need to check that
  if ($scope.item['dlv_invoice']!==undefined && $scope.item['dlv_invoice']!==null) {
    $scope.dlv_invoice.value = $scope.item['dlv_invoice'];
    $scope.loaded_existing = true;

    if ($scope.item['dlv_wholesale']!==undefined && $scope.item['dlv_wholesale']!==null) {
      $scope.dlv_wholesale.value = $scope.item['dlv_wholesale'];
      $scope.dlv_update_wholesale.value = $scope.item['dlv_update_wholesale'];
    }

    if ($scope.item['dlv_discount_applied']!==undefined && $scope.item['dlv_discount_applied']!==null) {
      $scope.dlv_discount_applied.value = $scope.item['dlv_discount_applied'];
    }

  }

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

  $scope.deleteFlag = function() {
    if ($scope.item['dlv_invoice']!==undefined) {
      $scope.item['dlv_invoice'] = null;
    }
    if ($scope.item['dlv_wholesale']!==undefined) {
      $scope.item['dlv_wholesale'] = null;
      $scope.item['dlv_update_wholesale'] = null;
    }
    if ($scope.item['dlv_discount_applied']!==undefined) {
      $scope.item['dlv_discount_applied'] = null;
    }

    $modalInstance.close(['delete', $scope.item]);
  };

  $scope.saveFlag = function() {
    $scope.form_ver = {
      error_dlv_invoice: false,
      error_dlv_wholesale: false,
      error_dlv_discount_applied: false
    };
    $scope.new_failure_msg = null;

    var all_clear = true;
    // dlv_invoice is required
    // dlv_wholesale is optional
    //    if dlv_wholesale is null, ignore dlv_update_wholesale
    // dlv_discount_applied is required if additional_pricing was not null
    if ($scope.dlv_invoice.value === null || MathService.numIsInvalidOrNegative($scope.dlv_invoice.value)) {
      all_clear = false;
      $scope.form_ver.error_dlv_invoice=true;
    }

    if ($scope.dlv_wholesale.value!==null) {
      if (MathService.numIsInvalidOrNegative($scope.dlv_wholesale.value) || $scope.dlv_wholesale.value===$scope.item['purchase_cost']) {
        all_clear = false;
        $scope.form_ver.error_dlv_wholesale=true;
      } 
    }

    if ($scope.item['additional_pricing']!==null) {
      if ($scope.dlv_discount_applied.value===null) {
        all_clear = false;
        $scope.form_ver.error_dlv_discount_applied=true;
      }
    }

    if (all_clear !== true) {
      $scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
      return;
    }

    $scope.item['dlv_invoice'] = $scope.dlv_invoice.value;
    if ($scope.dlv_wholesale.value!==null || $scope.item['dlv_wholesale']!==null) {
      $scope.item['dlv_wholesale'] = $scope.dlv_wholesale.value;
      $scope.item['dlv_update_wholesale'] = $scope.dlv_update_wholesale.value;
    }
    if ($scope.dlv_discount_applied!==null) {
      $scope.item['dlv_discount_applied'] = $scope.dlv_discount_applied.value;
    }
    $modalInstance.close(['save', $scope.item]);
  };

})

.controller('dlvAddNotesModalCtrl', function($scope, $modalInstance, $http, item) {

  $scope.item = item;
  console.log($scope.item);

  $scope.dlv_damaged_goods = {'value':false};
  $scope.dlv_rough_handling = {'value':false};
  $scope.dlv_wrong_item = {'value':false};
  $scope.dlv_comments = {'value':null};
  $scope.new_failure_msg = null;
  $scope.loaded_existing = false;

  if ($scope.item['dlv_damaged_goods']===true) {
    $scope.dlv_damaged_goods.value = true;
    $scope.loaded_existing = true;
  }
  if ($scope.item['dlv_rough_handling']===true) {
    $scope.dlv_rough_handling.value = true;
    $scope.loaded_existing = true;
  }
  if ($scope.item['dlv_wrong_item']===true) {
    $scope.dlv_wrong_item.value = true;
    $scope.loaded_existing = true;
  }
  if ($scope.item['dlv_comments']!==undefined && $scope.item['dlv_comments']!==null) {
    $scope.dlv_comments.value = $scope.item['dlv_comments'];
    $scope.loaded_existing = true;
  }

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

  $scope.deleteFlag = function() {
    if ($scope.item['dlv_damaged_goods']!==undefined) {
      $scope.item['dlv_damaged_goods'] = null;
    }
    if ($scope.item['dlv_rough_handling']!==undefined) {
      $scope.item['dlv_rough_handling'] = null;
    }
    if ($scope.item['dlv_wrong_item']!==undefined) {
      $scope.item['dlv_wrong_item'] = null;
    }
    if ($scope.item['dlv_comments']!==undefined) {
      $scope.item['dlv_comments'] = null;
    }
    $scope.item['dlv_has_notes'] = false;

    $modalInstance.close(['delete', $scope.item]);
  };

  $scope.saveFlag = function() {
    $scope.form_ver = {
      error_empty: false
    };
    $scope.new_failure_msg = null;

    var has_entry = false;
   
    if ($scope.dlv_damaged_goods.value===true) {
      has_entry = true;
    }
    if ($scope.dlv_rough_handling.value===true) {
      has_entry = true;
    }
    if ($scope.dlv_wrong_item.value===true) {
      has_entry = true;
    }
    if ($scope.dlv_comments.value!==null && $scope.dlv_comments.value.length > 0) {
      has_entry = true;
    }

    if (!has_entry) {
      $scope.form_ver.error_emptry = true;
      $scope.new_failure_msg = "Please choose or enter a comment or note."
      return;
    }

    if ($scope.dlv_damaged_goods.value===true) {
      $scope.item['dlv_damaged_goods'] = true;
    } else {
      $scope.item['dlv_damaged_goods'] = null;
    }
    if ($scope.dlv_rough_handling.value===true) {
      $scope.item['dlv_rough_handling'] = true;
    } else {
      $scope.item['dlv_rough_handling'] = null;
    }
    if ($scope.dlv_wrong_item.value===true) {
      $scope.item['dlv_wrong_item'] = true;
    } else {
      $scope.item['dlv_wrong_item'] = null;
    }
    if ($scope.dlv_comments.value!==null && $scope.dlv_comments.value.length > 0) {
      $scope.item['dlv_comments'] = $scope.dlv_comments.value;
    }
    $scope.item['dlv_has_notes'] = true;

    $modalInstance.close(['save', $scope.item]);
  };

});


angular.module('myApp')

.directive('addedInv', function($http, $modal, KegsService, DistributorsService, VolUnitsService, MathService) {
  return {
    restrict: 'AE',
    scope: {
      addedItems: '=', // shares this with added inv directive to pass common state
      removeBev: '&',      // pass added bev to caller
      removeKeg: '&',      // pass added keg to caller
      removeItem: '&',
      control: '=',
      isDelivery: '=',
      refreshDelivery: '&'
    },
    templateUrl: './view_loc/template_added_inv.html',
    link: function(scope, elem, attrs) {

      scope.enterInvQuantity = function(item, is_edit) {

        if (!is_edit) {
          item.quantity = 0;
        }
        
        var modalStartInstance = $modal.open({
          templateUrl: 'modalInvQuantity.html',
          controller: 'modalInvQuantityCtrl',
          windowClass: 'inv-qty-modal',
          backdropClass: 'gray-modal-backdrop',
          size: 'sm',
          resolve: {
            item: function() {
              return item;
            },
            is_edit: function() {
              return is_edit;
            },
            is_delivery: function() {
              return scope.isDelivery;
            }
          }
        });

        modalStartInstance.result.then(
          // success status
          function( result ) {
            // result is a list, first item is string for status, e.g.,
            // 'save' or 'delete'
            // second item is the affected beverage
            var status = result[0];
            var item = result[1];
            
            if (status === 'cancel') {
              item.quantity = 0;
            }
            // after a save, we want to re-calculate cost per mL, for instance
            else if (status === 'save') {
              console.log(item);



              /*
              if (scope.add_type === scope.add_types[0]) {
                scope.addBevToList(item);
              } else if (scope.add_type === scope.add_types[1]) {
                scope.addKegToList(item);
              }
              */
            } else if (status === 'edit') {
              ;
            }

            if (scope.refreshDelivery !== undefined && scope.refreshDelivery !== null) {
              scope.refreshDelivery();
            }
          }, 
          // error status
          function() {
            ;
          });
      };

      scope.removeAddedItem = function(item) {
        // removing item means removing from scope.addedItems
        // and (potentially) restoring it to filtered_bevs / filtered_kegs
        // based on current filtering criteria.  Need to also zero out its quantity.

        item.quantity = 0;

        for (var i in scope.addedItems) {
          var a_item = scope.addedItems[i];
          if (item.id === a_item.id && item.type === a_item.type) {
            scope.addedItems.splice(i, 1);
            console.log(i);
            break;
          }
        }

        // XXX pass to controller, which will then pass to be added to
        // the addable list, if necessary
        scope.removeItem({item:item});

        if (scope.refreshDelivery !== undefined && scope.refreshDelivery !== null) {
          scope.refreshDelivery();
        }

      };

      scope.promptRemoveItem = function(item) {

        var prompt = '';
        if (item.type==='bev') {
          prompt = "This will remove <b>" + item.product + "</b> from the added inventory list.  Continue?"
        } else if (item.type==='keg') {

        }

        swal({
          title: "Remove Item?",
          text: prompt,
          type: "warning",
          html: true,
          showCancelButton: true,
          confirmButtonColor: "#DD6B55",
          confirmButtonText: "Yes, remove it!",
          closeOnConfirm: true },
          function() {
            scope.removeAddedItem(item);
          });
      };

    }
  }
});
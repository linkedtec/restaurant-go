angular.module('myApp')

.directive('addableInv', function($http, $modal, KegsService, DistributorsService, VolUnitsService, MathService) {
  return {
    restrict: 'AE',
    scope: {
      allBevs: '=',
      allKegs: '=',
      addedItems: '=', // shares this with added inv directive to pass common state
      addBev: '&',      // pass added bev to caller
      addKeg: '&',      // pass added keg to caller
      control: '=',
      showTabs: '=',
      isDelivery: '=',
      refreshDelivery: '&',
      useOverrideAddFunc: '=',
      overrideAddFunc: '&' // by default adding will bring up inv quantity modal, if override callback is specified will call that instead
    },
    templateUrl: './view_loc/template_addable_inv.html',
    link: function(scope, elem, attrs) {

      // XXX NEED to have this $watch here so that if calling directive 
      // updates its allBevs AFTER this directive is done loading, the 
      // directive updates accordingly.  Had a big headache with the allBevs
      // showing up null on start.
      scope.$watch('allBevs', function() {
        scope.internalControl.applyTypeFilter ();
      });

      if (scope.isDelivery===undefined || scope.isDelivery===null) {
        scope.isDelivery = false;
      };

      scope.add_types = ['Beverages', 'Empty Kegs'/*, 'Recently Used in This Location'*/];
      scope.add_type = scope.add_types[0];

      scope.filtered_bevs = JSON.parse(JSON.stringify(scope.allBevs));
      scope.filtered_kegs = JSON.parse(JSON.stringify(scope.allKegs));

      // provides a way of exposing certain functions to outside controllers
      scope.internalControl = scope.control || {};

      scope.type_filters = ['All Beverages', 'Beer', 'Cider', 'Wine', 'Liquor', 'Non Alcoholic'];
      scope.type_filter = scope.type_filters[0];

      scope.container_filters = ['All Containers', 'Draft', 'Bottle', 'Can'];
      scope.container_filter = scope.container_filters[0];

      scope.dist_filters = ['All Distributors'];
      scope.dist_filter = scope.dist_filters[0];
      scope.distributors = null;

      scope.sort_key_bev = 'product';
      scope.sort_key_keg = 'distributor';
      scope.double_sort_bev = -1;
      scope.double_sort_keg = -1;

      scope.filter_query = {
        query: ''
      };

      // inserts an item into the addable list, e.g., when an item was
      // removed from the added list and needs to be re-inserted into the
      // addable list
      scope.internalControl.addItemToList = function( item ) {
        console.log('ADD TO LIST');
        console.log(item);
        
        // Check type and container filter to determine if should add back to
        // filtered_bevs
        if (item.type==='bev') {
          if (scope.container_filter !== scope.container_filters[0] && item.container_type !== scope.container_filter) {
            ;
          } else if (scope.type_filter !== scope.type_filters[0] && item.alcohol_type !== scope.type_filter) {
            ;
          } else {
            scope.filtered_bevs.push(item);
            scope.reSort();
          }
        } else if (item.type==='keg') {
          if (scope.dist_filter !== scope.dist_filters[0] && item.distributor !== scope.dist_filter) {
            ;
          } else {
            scope.filtered_kegs.push(item);
            scope.reSort();
          }
        }
        
        setInterval(
          function() {
            scope.$apply();
          }, 0);
        
      };

      scope.reSort = function() {
        if (scope.add_type===scope.add_types[0]) {

          scope.sortBevsBy(scope.sort_key_bev);
          scope.sortBevsBy(scope.sort_key_bev);

        } else if (scope.add_type===scope.add_types[1]) {
          scope.sortKegsBy(scope.sort_key_keg);
          scope.sortKegsBy(scope.sort_key_keg);

        }
      };

      scope.sortBevsBy = function(sort_str) {
        var double_sort = sort_str === scope.sort_key_bev;
        if (double_sort) {
          scope.double_sort_bev *= -1;
        } else {
          scope.double_sort_bev = -1;
        }
        scope.sort_key_bev = sort_str;
        //var isNum = (sort_str === 'unit_cost' || sort_str === 'quantity' || sort_str === 'inventory' || sort_str === 'deposit');
        var isNum = false;

        scope.filtered_bevs.sort(function(a, b) {
          var keyA = a[sort_str];
          var keyB = b[sort_str];
          if (scope.double_sort_bev > 0) {
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

      scope.sortKegsBy = function(sort_str) {
        var double_sort = sort_str === scope.sort_key_keg;
        if (double_sort) {
          scope.double_sort_keg *= -1;
        } else {
          scope.double_sort_keg = -1;
        }
        scope.sort_key_keg = sort_str;
        var isNum = (sort_str === 'deposit');

        scope.filtered_kegs.sort(function(a, b) {
          var keyA = a[sort_str];
          var keyB = b[sort_str];
          if (scope.double_sort_keg > 0) {
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
      scope.reSort();
      scope.reSort();

      scope.selectAddType = function(type) {
        scope.add_type = type;

        var doReSort = true;
        if (type === scope.add_types[1]) {
          if (scope.distributors === null) {
            scope.getDistributors();
            doReSort = false;
          }
        }

        if (doReSort) {
          scope.reSort();
        }
      };

      scope.getDistributors = function() {

        var result = DistributorsService.get();
        result.then(
          function(payload) {
            var data = payload.data;
            console.log(data);
            scope.distributors = data;
            if (scope.distributors===null || scope.distributors.length === 0) {
              scope.distributors = [];
            } else {
              for (var i in scope.distributors) {
                if (scope.distributors[i].kegs === null) {
                  scope.distributors[i].kegs = [];
                }
              }
            }
            for (var i in scope.distributors) {
              scope.dist_filters.push(scope.distributors[i]['name']);
            }
          },
          function(errorPayload) {
            ; // do nothing for now
          });

        scope.reSort();
      };

      scope.selectContainer = function(cont) {

        var check_cont = cont;
        if (check_cont==='Draft') {
          check_cont = "Keg";
        }

        if (check_cont===scope.container_filter) {
          return;
        }

        scope.container_filter = check_cont;

        scope.internalControl.applyTypeFilter ();
      };

      scope.selectType = function(type) {

        var check_type = type;
        if (check_type==='Non-Alc.') {
          check_type = "Non Alcoholic";
        };

        if (check_type===scope.type_filter) {
          return;
        }

        scope.type_filter = check_type;

        // reset container filters when type filter has changed
        if (check_type===scope.type_filters[0]) {
          scope.container_filters = ['All Containers', 'Draft', 'Bottle', 'Can'];
        }
        else if (check_type==='Beer' || check_type==='Cider') {
          scope.container_filters = ['All Containers', 'Draft', 'Bottle', 'Can'];
        } else if (check_type==='Wine' || check_type==='Liquor') {
          scope.container_filters = ['All Containers', 'Bottle'];
        } else {
          scope.container_filters = ['All Containers', 'Bottle', 'Can'];
        }
        scope.container_filter = scope.container_filters[0];

        scope.internalControl.applyTypeFilter ();
      }

      scope.internalControl.applyTypeFilter  = function() {
        // filter by eg Beer, Cider, Wine, etc
        // all beverages

        console.log("apply type filter");
        console.log(scope.allBevs);
        if (scope.add_type===scope.add_types[0]) {

          scope.filtered_bevs = [];

          if (scope.type_filter===scope.type_filters[0]) {
            console.log("all");
            scope.filtered_bevs = scope.allBevs;
            console.log(scope.allBevs);
          } else {
            for (var i in scope.allBevs) {
              var item = scope.allBevs[i];
              if (item.alcohol_type===scope.type_filter) {
                scope.filtered_bevs.push(item);
              }
            }
          } 
        }

        // refresh container filter
        scope.applyContainerFilter();
      };

      scope.applyContainerFilter = function() {
        // all beverages
        if (scope.add_type===scope.add_types[0]) {

          if (scope.container_filter===scope.container_filters[0]) {
            // With All Containers selected there is nothing to do
            console.log("Z");
            ;
          } else {
            var container_bevs = [];
            for (var i in scope.filtered_bevs) {
              var item = scope.filtered_bevs[i];
              if (item.container_type===scope.container_filter) {
                container_bevs.push(item);
              }
            }
            scope.filtered_bevs = container_bevs;
          }
        }

        scope.excludeAddedBevs();

        console.log(scope.filtered_bevs);
        setInterval(
          function() {
            scope.$apply();
          }, 0);
      };

      scope.excludeAddedBevs = function() {
        var new_bevs = [];
        for (var i in scope.filtered_bevs) {
          var bev = scope.filtered_bevs[i];
          var is_added = false;
          for (var j in scope.addedItems) {
            var added = scope.addedItems[j];
            if (bev.type===added.type && bev.version_id===added.version_id) {
              is_added = true;
              break;
            }
          }
          if (!is_added){ 
            new_bevs.push(bev);
          }
        }

        scope.filtered_bevs = new_bevs;

        scope.reSort();
      };

      scope.selectDistributorFilter = function(dist) {
        scope.dist_filter = dist;

        scope.applyDistributorFilter();
      };

      scope.applyDistributorFilter = function() {
        if (scope.dist_filter===scope.dist_filters[0]) {
          // With All Distributors selected there is nothing to do
          scope.filtered_kegs = scope.allKegs;
        } else {
          console.log(scope.dist_filter);
          var dist_kegs = [];
          for (var i in scope.allKegs) {
            var item = scope.allKegs[i];
            if (item.distributor===scope.dist_filter) {
              dist_kegs.push(item);
            }
          }
          scope.filtered_kegs = dist_kegs;
        }

        scope.excludeAddedKegs();
      };

      scope.excludeAddedKegs = function() {
        var new_kegs = [];
        for (var i in scope.filtered_kegs) {
          var keg = scope.filtered_kegs[i];
          var is_added = false;
          for (var j in scope.addedItems) {
            var added = scope.addedItems[j];
            if (keg.type===added.type && keg.version_id===added.version_id) {
              is_added = true;
              break;
            }
          }
          if (!is_added){ 
            new_kegs.push(keg);
          }
        }

        scope.filtered_kegs = new_kegs;

        scope.reSort();
      }

      scope.addBevToAdded = function(item) {
        for (var i in scope.filtered_bevs) {
          var check_item = scope.filtered_bevs[i];
          if (check_item.version_id === item.version_id) {
            scope.filtered_bevs.splice(i, 1);
            break;
          }
        }
        scope.addedItems.push(item);

        if (scope.refreshDelivery !== undefined && scope.refreshDelivery !== null) {
          scope.refreshDelivery();
        }
      };

      scope.addKegToAdded = function(item) {
        for (var i in scope.filtered_kegs) {
          var check_item = scope.filtered_kegs[i];
          if (check_item.version_id === item.version_id) {
            scope.filtered_kegs.splice(i, 1);
            break;
          }
        }
        scope.addedItems.push(item);

        if (scope.refreshDelivery !== undefined && scope.refreshDelivery !== null) {
          scope.refreshDelivery();
        }
      };

      /* not currently used
      scope.addInvToAdded = function(item) {
        if (scope.add_type === scope.add_types[0]) {
          scope.addBevToAdded(item);
        } else if (scope.add_type === scope.add_types[1]) {
          scope.addKegToAdded(item);
        }
      };
      */

      // on start up, remove from addable list anything already in the
      // added list
      scope.applyExisting = function() {
        scope.excludeAddedBevs();
        scope.excludeAddedKegs();
      };
      scope.applyExisting();

      scope.enterInvQuantity = function(item, is_edit) {

        // if overrideAddFunc was provided, will call that instead of the 
        // standard enterInvQuantity modal
        if (scope.useOverrideAddFunc === true) {
          scope.overrideAddFunc({item:item});
          return;
        }

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

              if (scope.add_type === scope.add_types[0]) {
                scope.addBevToAdded(item);
              } else if (scope.add_type === scope.add_types[1]) {
                scope.addKegToAdded(item);
              }
            } else if (status === 'edit') {
              ;
            }
            
          }, 
          // error status
          function() {
            ;
          });
      };

    }
  }
});
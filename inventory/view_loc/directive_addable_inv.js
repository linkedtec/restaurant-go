angular.module('myApp')

.directive('addableInv', function($http, $modal, DistributorsService, ItemsService, KegsService, MathService, UserService, VolUnitsService) {
  return {
    restrict: 'AE',
    scope: {
      allBevs: '=',
      allKegs: '=',
      addedItems: '=', // shares this with added inv directive to pass common state
      addBev: '&',      // pass added bev to caller
      addKeg: '&',      // pass added keg to caller
      control: '=?',
      showTabs: '=',
      showPurchase: '=?',
      isDelivery: '=',
      refreshDelivery: '&',
      useOverrideAddFunc: '=',
      distributorFilter: '=?', // only show bevs from this distributor
      saleStatusFilter: '=?', // only show bevs with active (Staple, Seasonal) sale_status
      overrideAddFunc: '&', // by default adding will bring up inv quantity modal, if override callback is specified will call that instead
      customButtonTitle: '=?'
    },
    templateUrl: './view_loc/template_addable_inv.html',
    link: function(scope, elem, attrs) {

      // XXX NEED to have this $watch here so that if calling directive 
      // updates its allBevs AFTER this directive is done loading, the 
      // directive updates accordingly.  Had a big headache with the allBevs
      // showing up null on start.
      scope.$watch('allBevs', function() {
        scope.internalControl.applyTypeFilter();
      });

      if (scope.isDelivery===undefined || scope.isDelivery===null) {
        scope.isDelivery = false;
      };

      scope.all_breweries = [];
      for ( var i=0; i < scope.allBevs.length; i++ ) {
        var bev = scope.allBevs[i];
        var exists = scope.all_breweries.indexOf(bev['brewery']) >= 0;
        if (!exists) {
          scope.all_breweries.push(bev['brewery']);
        }
      }

      scope.add_types = ['Beverages', 'Empty Kegs', '+ New Beverage'/*, 'Recently Used in This Location'*/];
      scope.add_type = scope.add_types[0];
      scope.tab_active = {};
      for (var i=0; i<scope.add_types.length; i++) {
        scope.tab_active[scope.add_types[i]] = false;
      }
      scope.tab_active[scope.add_types[0]] = true;

      scope.filtered_bevs = JSON.parse(JSON.stringify(scope.allBevs));
      scope.filtered_kegs = JSON.parse(JSON.stringify(scope.allKegs));

      scope.hideInactive = {value: false};

      // provides a way of exposing certain functions to outside controllers
      scope.internalControl = scope.control || {};

      scope.type_filters = ['All Beverages', 'Beer', 'Cider', 'Wine', 'Liquor', 'Non Alcoholic'];
      scope.type_filter = scope.type_filters[0];

      scope.container_filters = ['All Containers', 'Keg', 'Bottle', 'Can'];
      scope.container_filter = scope.container_filters[0];

      scope.dist_filters = ['All Distributors'];
      scope.dist_filter = scope.dist_filters[0];
      scope.distributors = null;

      scope.sort_key_bev = 'brewery';
      scope.sort_key_keg = 'distributor';
      scope.double_sort_bev = -1;
      scope.double_sort_keg = -1;

      scope.filter_query = {
        query: ''
      };

      if (scope.showPurchase === true) {
        scope.productCol = 'col-xs-3';
        scope.breweryCol = 'col-xs-3';
      } else {
        scope.productCol = 'col-xs-5';
        scope.breweryCol = 'col-xs-4';
      }

      // inserts an item into the addable list, e.g., when an item was
      // removed from the added list and needs to be re-inserted into the
      // addable list
      scope.internalControl.addItemToList = function( item ) {
        
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

        // XXX triggered inprog error, don't think we need this
        //scope.$apply();
        
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
        var isNum = (sort_str === 'batch_cost' || sort_str === 'par');

        var sub_sort = null;
        if (sort_str == 'brewery') {
          sub_sort = 'product';
        }

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

            if (keyA == keyB && sub_sort !== null) {
              return a[sub_sort].localeCompare(b[sub_sort]);
            }
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

        // if add_type is 2, that's add new beverage, don't change add_type,
        // just show new beverage modal
        if (type == scope.add_types[2]) {

          scope.createNewBeverage();
          scope.tab_active[scope.add_types[2]] = false;
          scope.tab_active[scope.add_type] = true;
          return;
        }

        scope.add_type = type;
        scope.tab_active[scope.add_type] = true;

        scope.reSort();
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
            UserService.checkAjaxLoginRequired(errorPayload.data);
          });

        scope.reSort();
      };

      scope.getVolUnits = function() {

        var result = VolUnitsService.get();
        result.then(
          function(payload) {
            var data = payload.data;
            if (data !== null) {
              scope.volume_units_full = data;
              scope.volume_units = [];
              for (var i=0; i < data.length; i++)
              {
                scope.volume_units.push(data[i].abbr_name);
              }
              // need to first load vol units before getting all distributors
              scope.getDistributors();
            }
          },
          function(errorPayload) {
            ; // do nothing for now
          });
      };
      scope.getVolUnits();

      scope.selectContainer = function(cont) {

        var check_cont = cont;

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
          scope.container_filters = ['All Containers', 'Keg', 'Bottle', 'Can'];
        }
        else if (check_type==='Beer' || check_type==='Cider') {
          scope.container_filters = ['All Containers', 'Keg', 'Bottle', 'Can'];
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

        console.log('applyTypeFilter');

        if (scope.add_type===scope.add_types[0]) {

          scope.filtered_bevs = [];

          var distBevs = [];
          if (scope.distributorFilter !== null && scope.distributorFilter !== undefined) {
            for (var i in scope.allBevs) {
              var item = scope.allBevs[i];
              if (item['distributor_id']===null) {
                continue;
              }
              if (item['distributor_id'] === scope.distributorFilter['id']) {
                distBevs.push(item);
              }
            }
          } else {
            distBevs = scope.allBevs;
          }

          if (scope.type_filter===scope.type_filters[0]) {
            scope.filtered_bevs = distBevs;
          } else {
            for (var i in distBevs) {
              var item = distBevs[i];
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

        if (scope.hideInactive.value===true) {
          scope.applySaleStatusFilter();
        } else {
          scope.excludeAddedBevs();
        }

        //scope.$apply();
      };

      scope.applySaleStatusFilter = function() {
        console.log('apply sale status');
        var active_bevs = [];
        for (var i in scope.filtered_bevs) {
          var item = scope.filtered_bevs[i];
          if (item.sale_status===null || item.sale_status==='Inactive') {
            ;
          } else {
            active_bevs.push(item);
          }
        }

        scope.filtered_bevs = active_bevs;

        console.log(scope.filtered_bevs);

        scope.excludeAddedBevs();
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

      scope.createNewBeverage = function() {
        var modalEditInstance = $modal.open({
          templateUrl: 'newInvModal.html',
          controller: 'newInvModalCtrl',
          windowClass: 'edit-inv-modal',
          backdropClass: 'white-modal-backdrop',
          resolve: {
            all_distributors: function() {
              return scope.distributors;
            },
            all_breweries: function() {
              return scope.all_breweries;
            },
            volume_units: function() {
              return scope.volume_units;
            },
            edit_mode: function() {
              return "all";
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
            var new_bev = result[1];
            if (status === 'save') {
              console.log(new_bev);

              if (scope.all_breweries.indexOf(new_bev.brewery) < 0) {
                scope.all_breweries.push(new_bev.brewery);
              }

              ItemsService.processBevsForAddable([new_bev]);
              scope.allBevs.push(new_bev);
              scope.internalControl.applyTypeFilter();

              swal({
                title: "Beverage Created!",
                text: "<b>" + new_bev.product + "</b> has been added to your Beverages DB.",
                type: "success",
                timer: 4000,
                allowOutsideClick: true,
                html: true});
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
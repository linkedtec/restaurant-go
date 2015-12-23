angular.module('myApp')

.factory("BeveragesService", function($http, DateService) {

  return {
    get: function() {
      var promise = $http.get('/inv');
      return promise;
    },

    post: function(new_beverage) {

      var distributor_id = null;
      var keg_id = null;
      if (new_beverage.distributor !== null) {
        distributor_id = new_beverage.distributor.id;
      }
      if (new_beverage.keg !== null) {
        keg_id = new_beverage.keg.id;
      }

      var promise = $http.post('/inv', {
        container_type: new_beverage['container_type'],
        serve_type: new_beverage['serve_type'],
        product: new_beverage['product'],
        brewery: new_beverage['brewery'],
        distributor_id: distributor_id,
        keg_id: keg_id,
        alcohol_type: new_beverage['alcohol_type'],
        abv: new_beverage['abv'],
        purchase_volume: new_beverage['purchase_volume'],
        purchase_unit: new_beverage['purchase_unit'],
        purchase_count: new_beverage['purchase_count'],
        purchase_cost: new_beverage['purchase_cost'],
        flavor_profile: new_beverage['flavor_profile'],
        size_prices: new_beverage['size_prices'],
        sale_status: new_beverage['sale_status'],
        sale_start: DateService.clientTimeToRestaurantTime(new_beverage['sale_start']),
        sale_end: DateService.clientTimeToRestaurantTime(new_beverage['sale_end']),
        par: new_beverage['par']
      });
      return promise;
    },

    put: function(edit_beverage, change_keys) {

      // adjust sale_start and sale_end to match restaurant time
      for (var i in change_keys) {
        var key = change_keys[i];
        if (key==='sale_start' || key==='sale_end') {
          edit_beverage[key] = DateService.clientTimeToRestaurantTime(edit_beverage[key]);
        }
      }

      var promise = $http.put('/inv', {
        beverage: edit_beverage,
        change_keys: change_keys
      });
      return promise;
    },

    delete: function(del_bev_id) {
      var promise = $http.delete('/inv', {
        params: {
          id: del_bev_id
        }
      });
      return promise;
    }

  };

});
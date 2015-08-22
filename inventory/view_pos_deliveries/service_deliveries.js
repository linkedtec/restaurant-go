angular.module('myApp')

.factory("DeliveriesService", function($http) {

  return {
    get: function(start_date, end_date, tz_offset, xport) {
      var params = { 
        start_date: start_date,
        end_date: end_date,
        tz_offset: tz_offset
      };
      if (xport!==null) {
        params['export'] = xport;
      }
      var promise = $http.get('/deliveries', {
        params: params });
      return promise;
    },

    post: function(new_delivery) {
      var promise = $http.post(
        '/deliveries', 
        new_delivery);

      return promise;
    },

    put: function(edit_delivery, change_keys) {
      var promise = $http.put('/deliveries', {
        delivery:edit_distributor,
        change_keys:change_keys
      });

      return promise;
    },

    delete: function(delivery_id) {
      var promise = $http.delete('/deliveries', {
        params: {
          id:delivery_id
        }
      });
      
      return promise;
    }
  };

})
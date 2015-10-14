angular.module('myApp')

.directive('emailButton', function($modal, $http, EmailService) {
  return {
    restrict: 'AE',
    scope: {
      popoverTitle: '=',
      sendEmail: '&'
    },
    templateUrl: './view_history/template_email_button.html',
    link: function(scope, elem, attrs) {

      scope.custom_email_valid = false;
      scope.custom_email = {email:""};
      scope.default_email = null;
      scope.editing_default_email = false;
      // default_email_tmp is an object so ng-change can track when it changes
      // to do on-the-fly error checking
      scope.default_email_tmp = {email:""};
      scope.default_email_valid = false;

      var test_user_id = 1;

      scope.getDefaultEmail = function() {
        $http.get('/users/inv_email', {
          params: {
            user_id: test_user_id
          }
        }).
        success(function(data, status, headers, config) {
          // this callback will be called asynchronously when the response
          // is available
          console.log(data);

          scope.default_email = data.email;
          
        }).
        error(function(data, status, headers, config) {

        });
      };
      scope.getDefaultEmail();

      scope.editDefaultEmail = function() {
        if (scope.default_email !== null) {
          scope.default_email_tmp.email = scope.default_email;
        } else {
          scope.default_email_tmp.email = "";
        }

        scope.editing_default_email = true;

        scope.defaultEmailTmpChanged();
        
      };

      scope.saveDefaultEmail = function() {
        if (!scope.default_email_valid) {
          return;
        }

        var test_user_id = 1;
        $http.post('/users/inv_email', {
            user_id: test_user_id,
            email: scope.default_email_tmp.email
          }).
          success(function(data, status, headers, config) {
            // this callback will be called asynchronously when the response
            // is available
            console.log(data);

            scope.editing_default_email = false;
            scope.default_email = scope.default_email_tmp.email;
            
          }).
          error(function(data, status, headers, config) {

          });
      };

      scope.emailTmpChanged = function(email) {
        return EmailService.isValidEmail(email);
      };

      scope.defaultEmailTmpChanged = function() {
        scope.default_email_valid = scope.emailTmpChanged(scope.default_email_tmp.email);
      };

      scope.customEmailChanged = function() {
        scope.custom_email_valid = scope.emailTmpChanged(scope.custom_email.email);
      }

      scope.cancelEditDefaultEmail = function()
      {
        scope.editing_default_email = false;
        scope.default_email_tmp.email = "";
      };

      scope.toggleEmailPopover = function() {
        scope.editing_default_email = false;
        scope.default_email_tmp.email = "";
      };

      scope.sendDefault = function() {
        scope.sendEmail( {
          email: scope.default_email
        });

        scope.closePopover(null, scope.default_email);
      };

      scope.sendCustom = function() {
        scope.sendEmail( {
          email: scope.custom_email.email
        });

        scope.closePopover(null, scope.custom_email.email);
      };

      // email popover:
      scope.closePopover = function(e, email) {

        // if email was not null, show a success message that email was sent
        if (email !== null) {
          swal({
            title: "Email Sent!",
            text: "An email has been sent to <b>" + email + "</b>",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
        }
        
        scope.editing_default_email = false;
        scope.default_email_tmp.email = "";
        scope.custom_email.email = "";
        scope.custom_email_valid = false;

        var popups = document.querySelectorAll('.popover');
        if(popups) {
          for(var i=0; i<popups.length; i++) {
            var popup = popups[i];
            var popupElement = angular.element(popup);
            popupElement.scope().$parent.isOpen=false;
            popupElement.remove();
            /*
            if(popupElement[0].previousSibling!=e.target){
              popupElement.scope().$parent.isOpen=false;
              popupElement.remove();
            }
            */
          }
        }
        console.log('closed');
      };

    }
  }
});
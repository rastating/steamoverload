var app = angular.module('steamoverload', [
    'ngRoute',
    'controllers'
]);

app.config(function ($routeProvider, $locationProvider) {
    $routeProvider.
        when('/panels', {
            templateUrl: '/static/partials/panels.html',
            controller: 'PanelDemoCtrl',
            requiresAuth: true
        }).
        when('/account/login', {
            templateUrl: '/static/partials/panels.html',
            controller: 'PanelDemoCtrl'
        }).
        otherwise({
            redirectTo: '/'
        });

    $locationProvider.html5Mode(true);
});

app.run(function ($rootScope, $location) {
    $rootScope.$on("$routeChangeStart", function (event, next, current) {
        if (next.requiresAuth && !$rootScope.user) {
            $location.path('/account/login');
        }
    });
});
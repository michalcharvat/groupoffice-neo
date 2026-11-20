/**
 * 
 * Credits: http://krasimirtsonev.com/blog/article/A-modern-JavaScript-router-in-100-lines-history-api-pushState-hash-url
 */

go.Router = (function () {
	var Router = Ext.extend(Ext.util.Observable, {
		routes: [],
		root: '/',

		pathBeforeLogin: "",
		suspendEvent: false,

		previousPath: null,
		loadedPath: null,

		routing: false,

		requireAuthentication: false,

		defaultRoute: null,

		params: [],


		getParams() {
			return this.params;
		},

		config: function (options) {
			this.root = options && options.root ? '/' + this.trimSlashes(options.root) + '/' : '/';
			return this;
		},
		getPath: function () {
			return window.location.hash.substr(1);
		},

		setPath: function (path) {
			//this._setPath = path; //to cancel event
			if ("#" + path != window.location.hash) {
				this.suspendEvent = true;
				window.location.hash = path;
			}
		},

		trimSlashes: function (path) {
			return path.toString().replace(/\/$/, '').replace(/^\//, '');
		},

		/**
		 * Add a route
		 * 
		 * @example
		 * 
		 * ```
		 * go.Router.add(/([a-zA-Z0-9]*)\/([0-9]*)/, function(entity, id) {
		 * 
		 * });
		 * 
		 * @param {RegExp|function} /notes/(.*)/
		 * @param {type} handler
		 * @returns {go.Router}
		 */
		add: function (re, handler, requireAuthentication) {

			if (typeof requireAuthentication === "undefined") {
				requireAuthentication = true;
			}

			if (typeof re == 'function') {
				handler = re;
				re = '';
				this.defaultRoute = { re: re, handler: handler, requireAuthentication: requireAuthentication };
				return this;
			}

			this.routes.push({ re: re, handler: handler, requireAuthentication: requireAuthentication });
			return this;
		},
		remove: function (param) {
			for (var i = 0, r; i < this.routes.length, r = this.routes[i]; i++) {
				if (r.handler === param || r.re.toString() === param.toString()) {
					this.routes.splice(i, 1);
					return this;
				}
			}
			return this;
		},
		flush: function () {
			this.routes = [];
			this.root = '/';
			return this;
		},
		check: function (f) {
			var path = f || this.getPath();

			this.oldPath = this.loadedPath;
			this.loadedPath = path;



			for (var i = 0; i < this.routes.length; i++) {
				var match = path.match(this.routes[i].re);
				if (match) {
					match.shift();
					return this.handleRoute(this.routes[i], match);
				}
			}
			return this.defaultRoute ? this.handleRoute(this.defaultRoute, []) : this;
		},

		handleRoute: function (route, match) {
			this.requireAuthentication = route.requireAuthentication;

			if (!go.User.isLoggedIn() && route.requireAuthentication) {

				console.log("redirect", route);
				go.AuthenticationManager.login();

				return;// this.goto('login');
			}


			for (var n = 0, l = match.length; n < l; n++) {
				match[n] = match[n] ? decodeURIComponent(match[n]) : match[n];
			}

			this.params = match;

			if (this.suspendEvent) {
				var me = this;
				setTimeout(function () {
					me.suspendEvent = false;
				});

				return this;
			}

			this.routing = window.groupofficeCore.router.routing = true;
			route.handler.apply({}, match);
			this.routing = window.groupofficeCore.router.routing = false;

			this.fireEvent("change", this.getPath(), this.oldPath, route);
			return this;
		},

		goto: function (path) {

			if (this.getPath() == path) {

				//rerun route if hash is the same
				go.Router.check();
			} else {
				window.location.hash = path || "";
			}
			return this;
		},

		login: function() {

			console.warn('redirect to login');
			//prevent double calls because that made the page load twict
			//this caused problems with the remember login cookie being regenerated twice
			// the user received an invalid cookie theft notice
			if(!this.redirectingToLogin) {
				alert( t("Your session is no longer valid. Press OK to authenticate."));
				this.redirectingToLogin = true;
				document.location.href = BaseHref;

			}
		}
	});

	return new Router();
})();

//// configuration
go.Router.config({ mode: 'hash' });

/**
 * The redirect of a password recovery link (already decoded by the router), only when it stays
 * inside this GroupOffice: same origin, below the installation path, http(s). The neo client
 * checks the same (views/neo/apps/go/view/LoginView.mjs safeRedirect()).
 *
 * @param {string} value
 * @return {string|null}
 */
go.Router.safeRedirect = function (value) {
	if (!value) {
		return null;
	}
	try {
		var base = new URL(BaseHref, document.location.href),
			url = new URL(String(value), base);

		return /^https?:$/.test(url.protocol) && url.origin === base.origin && url.pathname.indexOf(base.pathname) === 0
			? url.href
			: null;
	} catch (e) {
		return null;
	}
};

GO.mainLayout.on("boot", function () {

	go.Router.add(/^recover\/([a-f0-9]{40})-?(.*)/, function (hash, redirectUrl) {
		var recoveryPanel = new go.login.RecoveryDialog();
		recoveryPanel.show(hash, go.Router.safeRedirect(redirectUrl));
	}, false);

	// default route
	go.Router.add(function () {
		if (go.User.isLoggedIn()) {
			if(go.Router.getPath() != GO.settings.start_module) {
				go.Router.goto(GO.settings.start_module);
			} else
			{
				var firstTab = GO.mainLayout.tabPanel.items.itemAt(0);
				GO.mainLayout.tabPanel.setActiveTab(firstTab);
			}
		}
	});
});




window.addEventListener('hashchange', function () {
	go.Router.previousPath = go.Router.loadedPath;
	go.Router.check();
}, false);


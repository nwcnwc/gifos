

	Number.prototype.clamp = function(min, max)
	{
		return Math.min(Math.max(this, min), max);
	};

	/*
	 *	add a blank line to push 'Prevent this page from opening ...'
	 *	tack-on from the actual message we are trying to display
	 */
	var confirm_org = window.confirm;
	var alert_org   = window.alert;
	window.confirm = function(msg) { return confirm_org(msg + "\n "); }
	window.alert   = function(msg) { return alert_org  (msg + "\n "); }





	function AppConfig()
	{
		this.verLast      = null;           // last used codeVersion
		this.verSeen      = null;           // latest codeVersion they saw the changelog for

		this.maxUndo      = 50;             // board revisions to keep
		this.fontName     = null;           // font-family
		this.fontSize     = null;           // font-size
		this.lineHeight   = null;           // line-height
		this.listWidth    = null;           // list-width
		this.theme        = null;           // default or 'dark'

		this.fileLinks    = false;          // mark up `foo` as <a href=file:///foo>...</a>

		this.board        = null;           // active board

		this.backups      =
		{
			agents : [ ],               // [ { type, id, enabled, conf } ];
			nextId : 1
		};

		this.backupStatus = { };            // agentId => [ 'conf' ]
	}

	const default_backup_agents =
	[
		{ base: 'http://127.0.0.1:10001', auth: '' }, // local agent
		{ base: '', auth: '' }                        // remote agent
	];

	//

	function BoardMeta()
	{
		this.title   = '';
		this.current = 1;                   // revision
		this.ui_spot = 0;                   // 0 = not set
		this.history = [ ];                 // revision IDs
		this.backupStatus = { };            // agentId => [ what's backed up ]
	}

	class Storage
	{
		constructor()
		{
			this.type = '?';

			this.conf = new AppConfig();
			this.boardIndex = new Map();

			this.backups =
			{
				status : '',      // '', 'ok', 'busy', 'failed'
				agents : [ ],     // BackupStorage instances
			};
		}

		open()
		{
			return this.openInner();
		}

		wipe()
		{
			return this.wipeInner();
		}

		getConfig()
		{
			return this.conf;
		}

		setVerLast()
		{
			if (this.conf.verLast == NB.codeVersion)
				return true;

			this.conf.verLast = NB.codeVersion;
			return this.saveConfig();
		}

		setVerSeen(ver)
		{
			this.conf.verSeen = ver || NB.codeVersion;
			return this.saveConfig();
		}

		setActiveBoard(board_id)
		{
			console.log('setActiveBoard [' + this.conf.board + '] -> [' + board_id + ']');

			var meta = board_id ? this.boardIndex.get(board_id) : true;

			if (! meta)
				throw `Invalid board_id in setActiveBoard(... ${board_id})`;

			if (this.conf.board == board_id)
				return true;

			this.conf.board = board_id;
			return this.saveConfig();
		}

		setTheme(theme)
		{
			if (this.conf.theme == theme) return;
			this.conf.theme = theme;
			return this.saveConfig();
		}

		setFontName(fname)
		{
			if (this.conf.fontName == fname) return;
			this.conf.fontName = fname;
			return this.saveConfig();
		}

		setFontSize(fs)
		{
			if (this.conf.fontSize == fs) return;
			this.conf.fontSize = fs;
			return this.saveConfig();
		}

		setLineHeight(lh)
		{
			if (this.conf.lineHeight == lh) return;
			this.conf.lineHeight = lh;
			return this.saveConfig();
		}

		setListWidth(lw)
		{
			if (this.conf.listWidth == lw) return;
			this.conf.listWidth = lw;
			return this.saveConfig();
		}

		saveConfig()
		{
			this.backupConfig();
			return this.setJson('config', this.conf);
		}

		//

		getBoardIndex()
		{
			return this.boardIndex;
		}

		saveBoard(board)
		{
			/*
			 *	1. assign new revision (next unused)
			 *	2. trim all in-between revisions bypassed by undos if any
			 *	3. cap history as per config
			 */
			var meta = this.boardIndex.get(board.id);
			var ok_data, ok_meta;

			delete board.history; // remove temporarily

			if (! meta)
			{
				board.revision = 1;

				ok_data = this.setJson('board.' + board.id + '.' + board.revision, board);

				meta = new BoardMeta();
				meta.title   = board.title || '(Untitled board)';
				meta.current = board.revision;
				meta.history = [ board.revision ];

				this.boardIndex.set(board.id, meta);
			}
			else
			{
				var rev_old = board.revision;
				var rev_new = meta.history[0] + 1;

				board.revision = rev_new;

				ok_data = this.setJson('board.' + board.id + '.' + board.revision, board);

				meta.title   = board.title || '(Untitled board)';
				meta.current = board.revision;

				// trim revisions skipped over with undo and cap the revision count

				var rebuild = [ board.revision ];

				for (var rev of meta.history)
				{
					if ( (rev_old < rev && rev < rev_new) || (rebuild.length >= this.conf.maxUndo) )
					{
						this.delItem('board.' + board.id + '.' + rev);
						console.log( `Deleted revision ${rev} of ${board.id} (${board.title})` );
					}
					else
					{
						rebuild.push(rev);
					}
				}

				meta.history = rebuild;
			}

			/*
			 *	save meta
			 */
			ok_meta = this.setJson('board.' + board.id + '.meta', meta) &&
			          this.setJson('board.' + board.id, meta.current); // for older versions

			/*
			 *	run backups
			 */
			if (ok_meta && ok_data)
				this.backupBoard(board.id, board, meta)

			board.history = meta.history; // restore

			console.log( `Saved revision ${board.revision} of ${board.id} (${board.title}), ok = ${ok_data} | ${ok_meta}` );
			return ok_data && ok_meta;
		}

		loadBoard(board_id, revision)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in loadBoard(${board_id}, ${revision})`;

			if (revision == null)
				revision = meta.current;

			if (! meta.history.includes(revision))
				throw `Invalid revision in loadBoard(${board_id}, ${revision})`;

			var board = this.getJson('board.' + board_id + '.' + revision);
			if (! board)
				return false;

			if (board.format != NB.blobVersion)
			{
				console.log('Board ' + board_id + '/' + revision + ' format is unsupported');
				console.log('Have [' + board.format + '], need [' + NB.blobVersion);
				return false;
			}

			if (board.revision != revision)
			{
				console.log('Board ' + board_id + '/' + revision + ' revision is wrong');
				console.log('Have [' + board.revision + ']');
				return false;
			}

			board.history = meta.history;

			console.log( `Loaded revision ${board.revision} of ${board.id} (${board.title})` );

			return Object.assign(new Board(), board);
		}

		nukeBoard(board_id)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in nukeBoard(${board_id})`;

			var title = meta.title + '';

			for (var rev of meta.history)
				this.delItem('board.' + board_id + '.' + rev);

			this.delItem('board.' + board_id + '.meta');
			this.boardIndex.delete(board_id);

			this.backups.agents.forEach(function(store){
				store.nukeBoard(board_id);
			});

			console.log( `Deleted board ${board_id} (${title})` );
		}

		getBoardHistory(board_id)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in getBoardHistory(${board_id})`;

			return meta.history;
		}

		setBoardRevision(board_id, revision)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in setBoardRevision(${board_id}, ${revision})`;

			if (! meta.history.includes(revision))
				throw `Invalid revision in setBoardRevision(${board_id}, ${revision})`;

			if (meta.current == revision) // wth
				return true;

			meta.current = revision;

			this.backupBoard(board_id, null, meta);

			return this.setJson('board.' + board_id + '.meta', meta) &&
			       this.setJson('board.' + board_id, revision); // for older versions
		}

		setBoardUiSpot(board_id, ui_spot)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in setBoardUiSpot(${board_id}, ${ui_spot})`;

			meta.ui_spot = ui_spot;

			this.backupBoard(board_id, null, meta);

			return this.setJson('board.' + board_id + '.meta', meta);
		}

		/*
		 *	private
		 */

		getItem(name) { throw 'implement-me'; }
		setItem(name) { throw 'implement-me'; }
		delItem(name) { throw 'implement-me'; }

		openInner()   { throw 'implement-me'; }
		wipeInner()   { throw 'implement-me'; }

		getJson(name)
		{
			var foo = this.getItem(name);
			if (! foo) return false;

			try { foo = JSON.parse(foo); } catch (x) { return false; }
			return foo;
		}

		setJson(name, val)
		{
			if (! this.setItem(name, JSON.stringify(val)))
			{
				console.log("setJson(" + name + ") failed");
				return false;
			}

			return true;
		}

		/*
		 *	config
		 */
		fixupConfig(newInstall)
		{
			var conf = this.conf;
			var simp = (new SimpleBackup).type;

			if (conf.board && ! this.boardIndex.has(conf.board))
				conf.board = null;

			if (! conf && ! newInstall) // pre-20210410 upgrade
			{
				conf.verLast = 20210327;
				conf.verSeen = 20200220; // 20200429;
			}

			var agents = conf.backups.agents;

			if (agents.length != 2 ||
			    agents[0].type != simp || agents[0].conf.base != 'http://127.0.0.1:10001' ||
			    agents[1].type != simp)
			{
				const def = default_backup_agents;

				console.log('Unexpected backup config, will re-initialize.', agents);

				conf.backups.agents = [];

				conf.backups.agents.push({
					// localhost
					type    : simp,
					id      : simp + '-' + (conf.backups.nextId++),
					enabled : def[0].base && def[0].auth,
					conf    : def[0],
				})

				conf.backups.agents.push({
					// remote
					type    : simp,
					id      : simp + '-' + (conf.backups.nextId++),
					enabled : def[1].base && def[1].auth,
					conf    : def[1],
				})

				this.saveConfig();
			}
		}

		/*
		 *	backups
		 */
		initBackups(onBackupStatus)
		{
			var self = this;
			var pending = 0;
			var success = true;
			var store_id = 1;

			self.backups.agents = [];

			onBackupStatus(null);

			this.conf.backups.agents.forEach(function(b){

				var T = NB.backupTypes.get(b.type);
				if (! T)
				{
					console.log( `Unknown backup type "${b.type}" - skipped` );
					return;
				}

				if (! b.enabled)
					return;

				var agent = new T(b.id, b.conf, onBackupStatus);
				self.backups.agents.push(agent);

				console.log( `Added backup agent - type '${agent.type}', id '${agent.id}'` );

				agent.checkStatus(null); // will need just onBackupStatus() callbacks
			});
		}

		backupBoard(board_id, board, meta)
		{
			var self = this;
			var was = meta.backupStatus || {};

			meta.backupStatus = {};

			if (! this.backups.agents.length)
			{
				if (was['data'] || was['meta'])
					self.setJson('board.' + board_id + '.meta', meta);
				return;
			}

			console.log( `Backing up ${board_id}...` );

			this.backups.agents.forEach(function(agent){

				var fields = was[agent.id] || {};

				if (board) delete fields.data;
				if (meta)  delete fields.meta;

				meta.backupStatus[agent.id] = fields;

				agent.saveBoard(board_id, board, meta, function(ok){

					var what = 'Backup of ' + board_id + (board ? '' : ' (meta)');
					console.log( `${what} to '${agent.id}' -> ${ok ? 'ok' : 'failed'}` );

					if (ok)
					{
						if (board) fields.data = + new Date();
						if (meta)  fields.meta = + new Date();

						meta.backupStatus[agent.id] = fields;
					}

					self.setJson('board.' + board_id + '.meta', meta);
				});
			});
		}

		backupConfig()
		{
			var self = this;
			var was = self.conf.backupStatus || {};

			self.conf.backupStatus = {};

			if (! this.backups.agents.length)
			{
				if (was['conf'])
					this.setJson('config', this.conf);
				return;
			}

			this.backups.agents.forEach(function(agent){

				var fields = { };

				self.conf.backupStatus[agent.id] = fields;

				agent.saveConfig(self.conf, function(ok){

					if (ok)
					{
						fields.conf = + new Date()
						self.conf.backupStatus[agent.id] = fields;
					}

					self.setJson('config', self.conf);
				});
			});
		}
	};

	class Storage_Local extends Storage
	{
		constructor()
		{
			super();
			this.type = 'LocalStorage';
		}

		getItem(name)
		{
			return localStorage.getItem('nullboard.' + name);
		}

		setItem(name, val)
		{
			localStorage.setItem('nullboard.' + name, val);
			return true;
		}

		delItem(name)
		{
			localStorage.removeItem('nullboard.' + name);
			return true;
		}

		openInner()
		{
			var conf = this.getJson('config');
			var newInstall = true;

//			if (conf && (conf.format != NB.confVersion))
//			{
//				if (! confirm('Preferences are stored in an unsupported format. Reset them?'))
//					return false;
//
//				conf = null;
//			}

			if (conf)
			{
				this.conf = Object.assign(new AppConfig(), conf);
			}
			else
			{
				this.conf.theme = this.getItem('theme');

				if (this.getItem('fsize') == 'z1')
				{
					this.conf.fontSize   = 13;
					this.conf.lineHeight = 17;
				}

				if (! this.setJson('config', this.conf))
				{
					this.conf = null;
					return false;
				}

				this.conf.board = this.getItem('last_board');
			}

			this.boardIndex = new Map();

			// new format

			for (var i=0; i<localStorage.length; i++)
			{
				var k = localStorage.key(i);
				var m = k.match(/^nullboard\.board\.(\d+).meta$/);

				if (! m)
					continue;

				var board_id = parseInt(m[1]);
				var meta = this.getJson('board.' + board_id + '.meta');

				if (! meta.hasOwnProperty('history'))
				{
					console.log( `Invalid meta for board ${board_id}` );
					continue;
				}

				for (var rev of meta.history)
					if (! this.getJson('board.' + board_id + '.' + rev))
					{
						console.log( `Invalid revision ${rev} in history of ${board_id}` );
						meta = this.rebuildMeta(board_id);
						break;
					}

				if (! meta)
					continue;

				delete meta.backingUp;      // run-time var
				delete meta.needsBackup;    // ditto

				meta = Object.assign(new BoardMeta(), meta);
				this.boardIndex.set(board_id, meta);
			}

			// old format

			for (var i=0; i<localStorage.length; i++)
			{
				var k = localStorage.key(i);
				var m = k.match(/^nullboard\.board\.(\d+)$/);

				if (! m)
					continue;

				newInstall = false;

				var board_id = parseInt(m[1]);
				if (this.boardIndex.has(board_id))
					continue;

				var meta = this.rebuildMeta(board_id);
				if (! meta)
					continue;

				meta = Object.assign(new BoardMeta(), meta);
				this.boardIndex.set(board_id, meta);
			}

			this.fixupConfig(newInstall);

			this.type = 'LocalStorage';

			return true;
		}

		wipeInner()
		{
			for (var i=0; i<localStorage.length; )
			{
				var k = localStorage.key(i);
				var m = k.match(/^nullboard\./);

				if (m) localStorage.removeItem(k);
				else   i++;
			}

			this.conf = new AppConfig();
			this.boardIndex = new Map();
		}

		/*
		 *	private
		 */
		rebuildMeta(board_id)
		{
			var meta = new BoardMeta();

			console.log( `Rebuilding meta for ${board_id} ...` );

			// get current revision

			meta.current = this.getItem('board.' + board_id); // may be null

			// load history

			var re = new RegExp('^nullboard\.board\.' + board_id + '\.(\\d+)$');
			var revs = new Array();

			for (var i=0; i<localStorage.length; i++)
			{
				var m = localStorage.key(i).match(re);
				if (m) revs.push( parseInt(m[1]) );
			}

			if (! revs.length)
			{
				console.log('* No revisions found');
				this.delItem('board.' + board_id);
				return false;
			}

			revs.sort(function(a,b){ return b-a; });
			meta.history = revs;

			// validate current revision

			if (! meta.history.includes(meta.current))
				meta.current = meta.history[meta.history.length-1];

			// get board title

			var board = this.getJson('board.' + board_id + '.' + meta.current)
			meta.title = (board.title || '(untitled board)');

			this.setJson('board.' + board_id + '.meta', meta);

			return meta;
		}
	}

	/*
	 *
	 */
	class BackupStorage
	{
		constructor(id, conf, onStatusChange)
		{
			this.type           = '?';

			this.id             = id;
			this.conf           = conf;
			this.status         = '';
			this.lastOp         = '';
			this.lastXhr        = { op: '', text: '', code: 0 };
			this.onStatusChange = onStatusChange;
			this.queue          = [];
		}

		checkStatus(cb)                { return false; }
		saveConfig(conf, cb)           { throw 'implement-me'; }
		saveBoard (id, data, meta, cb) { throw 'implement-me'; }
		nukeBoard (id, cb)             { throw 'implement-me'; }
	}

	class SimpleBackup extends BackupStorage
	{
		constructor(id, conf, onStatusChange)
		{
			super(id, null, onStatusChange);

			this.type = 'simp';
			this.conf = { base: '', auth: '' }
			this.conf = Object.assign(this.conf, conf);
		}

		checkStatus(cb)
		{
			this.queue.push({
				what : 'checkStatus',
				cb   : cb,
				args :
				{
					url: this.conf.base + '/config',
					type: 'put',
					headers: { 'X-Access-Token': this.conf.auth },
					data:
					{
						self: document.location.href,
					//	conf: -- without the data --
					},
					dataType: 'json'
				}
			});

			this.runQueue();
		}

		saveConfig(conf, cb)
		{
			this.queue.push({
				what : 'saveConfig',
				cb   : cb,
				args :
				{
					url: this.conf.base + '/config',
					type: 'put',
					headers: { 'X-Access-Token': this.conf.auth },
					data:
					{
						self: document.location.href,
						conf: JSON.stringify(conf)
					},
					dataType: 'json'
				}
			});

			this.runQueue();
		}

		saveBoard(id, data, meta, cb)
		{
			this.queue.push({
				what : 'saveBoard',
				cb   : cb,
				args :
				{
					url: this.conf.base + '/board/' + id,
					type: 'put',
					headers: { 'X-Access-Token': this.conf.auth },
					data:
					{
						self: document.location.href,
						data: data ? JSON.stringify(data) : null,
						meta: meta ? JSON.stringify(meta) : null
					},
					dataType: 'json'
				}
			});

			this.runQueue();
		}

		nukeBoard(id, cb)
		{
			this.queue.push({
				what : 'saveBoard',
				cb   : cb,
				args :
				{
					url:  this.conf.base + '/board/' + id,
					type: 'delete',
					headers: { 'X-Access-Token': this.conf.auth },
				}
			});

			this.runQueue();
		}

		/*
		 *	private
		 */
		runQueue()
		{
			var self = this;

			if (! this.queue.length)
				return;

			if (this.status == 'busy')
				return;

			var req = this.queue.shift();

			this.setStatus('busy', req.what);

			$.ajax(req.args)
			 .done(function(d, s, x) { self.onRequestDone(req,  true, x); })
			 .fail(function(x, s, e) { self.onRequestDone(req, false, x); })
		}

		onRequestDone(req, ok, xhr)
		{
			console.log( `Backup agent '${this.id}', ${this.lastOp}() -> ${ok ? 'ok' : 'failed'}` );

			var code = xhr.status;
			var text = xhr.responseText || (code ? `Response code ${code}` : 'Offline or CORS-blocked');

			this.lastXhr = { text: text, code: code };

			if (req.cb) req.cb.call(this, ok);

			if (! this.queue.length)
			{
				this.setStatus(ok ? 'ready' : 'error', this.lastOp);
				return;
			}

			this.status = 'pre-busy';
			this.runQueue();
		}

		setStatus(status, op)
		{
			if (status == 'busy' && this.status == 'busy')
				throw `Backup agent ${this.id} is already busy!`;

			console.log( `Backup agent '${this.id}' status: '${this.status}' -> '${status}'` );

			this.status = status;
			this.lastOp = op;
			this.onStatusChange(this);
		}
	}





	function Note(text)
	{
		this.text = text;
		this.raw  = false;
		this.min  = false;
	}

	function List(title)
	{
		this.title = title;
		this.notes = [ ];

		this.addNote = function(text)
		{
			var x = new Note(text);
			this.notes.push(x);
			return x;
		}
	}

	function Board(title)
	{
		this.format   = NB.blobVersion;
		this.id       = +new Date();
		this.revision = 0;
		this.title    = title || '';
		this.lists    = [ ];

		this.addList = function(title)
		{
			var x = new List(title);
			this.lists.push(x);
			return x;
		}
	}





	function Drag2()
	{
		// config
		this.listSel    = null;
		this.itemSel    = null;
		this.dragster   = null;
		this.onDragging = function(started) { }
		this.swapAnimMs = 200;

		// state
		this.item    = null;
		this.priming = null;
		this.primeXY = { x: 0, y: 0 };
		this.$drag   = null;
		this.mouseEv = null;
		this.delta   = { x: 0, y: 0 };
		this.inSwap  = 0;

		// api
		this.prime = function(item, ev)
		{
			var self = this;

			this.item = item;
			this.priming = setTimeout(function(){ self.onPrimed.call(self); }, ev.altKey ? 1 : 500);
			this.primeXY = { x: ev.clientX, y: ev.clientY };
			this.mouseEv = ev;
		}

		this.cancelPriming = function()
		{
			if (! this.item || ! this.priming)
				return;

			clearTimeout(this.priming);
			this.priming = null;
			this.item = null;
		}

		this.end = function()
		{
			this.cancelPriming();
			this.stopDragging();
		}

		this.isActive = function()
		{
			return this.item && (this.priming == null);
		}

		this.onPrimed = function()
		{
			clearTimeout(this.priming);
			this.priming = null;

			removeTextSelection();

			var $item = $(this.item);
			$item.addClass('dragging');

			$('body').append('<div class=' + this.dragster + '></div>');
			var $drag = $('body .' + this.dragster).last();

			$drag.outerWidth ( $item.outerWidth()  );
			$drag.outerHeight( $item.outerHeight() );

			this.$drag = $drag;

			if (this.onDragging)
				this.onDragging.call(this, true); // started

			var $win = $(window);
			var scroll_x = $win.scrollLeft();
			var scroll_y = $win.scrollTop();

			var pos = $item.offset();
			this.delta.x = pos.left - this.mouseEv.clientX - scroll_x;
			this.delta.y = pos.top  - this.mouseEv.clientY - scroll_y;

			this.adjustDrag();

			$drag.css({ opacity: 1 });

			$('body').addClass('dragging');
		}

		this.adjustDrag = function()
		{
			if (! this.$drag)
				return;

			var drag = this;
			var $drag = this.$drag;

			var $win = $(window);
			var scroll_x = $win.scrollLeft();
			var scroll_y = $win.scrollTop();

			var drag_x = drag.mouseEv.clientX + drag.delta.x + scroll_x;
			var drag_y = drag.mouseEv.clientY + drag.delta.y + scroll_y;

			$drag.offset({ left: drag_x, top: drag_y });

			if (drag.inSwap)
				return;

			/*
			 *	see if a swap is in order
			 */
			var pos = $drag.offset();
			var x = pos.left + $drag.width()/2 - $win.scrollLeft();
			var y = pos.top + $drag.height()/2 - $win.scrollTop();

			var targetList = null;
			var targetItem = null;  // if over some item
			var before = false;     // if should go before targetItem

			var $target;

			$(this.listSel).each(function(){

				var list = this;
				var rcList = list.getBoundingClientRect();
				var yTop, itemTop = null;
				var yBottom, itemBottom = null;

				if (x <= rcList.left || rcList.right <= x)
					return;

				$(list).find(drag.itemSel).each(function(){
					var rcItem = this.getBoundingClientRect();

					if (! itemTop || rcItem.top < yTop)
					{
						itemTop = this;
						yTop = rcItem.top;
					}

					if (! itemBottom || yBottom < rcItem.bottom)
					{
						itemBottom = this;
						yBottom = rcItem.bottom;
					}

					if (y <= rcItem.top || rcItem.bottom <= y)
						return;

					if (this == drag.item)
						return;

					targetList = list;
					targetItem = this;
					before = (y < (rcItem.top + rcItem.bottom)/2);
				});

				if (y < rcList.top)
				{
					targetList = list;
					targetItem = itemTop;
					before = true;
				}
				else
				if (y >= rcList.bottom)
				{
					targetList = list;
					targetItem = itemBottom;
					before = false;
				}

			});

			if (! targetList)
				return;

			if (targetItem)
			{
				if (targetItem == drag.item)
					return;

				$target = $(targetItem);

				if (! before && $target.next()[0] == drag.item ||
				      before && $target.prev()[0] == drag.item)
					return;
			}

			/*
			 *	swap 'em
			 */
			var have = drag.item;
			var $have = $(have);
			var $want = $have.clone();

			$want.css({ display: 'none' });

			if (targetItem)
			{
				if (before)
				{
					$want.insertBefore($target);
					$want = $target.prev();
				}
				else
				{
					$want.insertAfter($target);
					$want = $target.next();
				}
			}
			else
			{
				var $list = $(targetList);
				$want = $list.append($want).find(drag.itemSel)
			}

			drag.item = $want[0];

			if (! drag.swapAnimMs)
			{
				$have.remove();
				$want.show();
				return;
			}

			/*
			 *	see if it's a same-list move
			 */
			if (targetList == have.parentNode)
			{
				var delta = $have.offset().top - $target.offset().top;

				var d_bulk = 0;
				var d_have = 0;
				var $bulk = $();

				if (delta < 0) // item is moving down
				{
					for (var $i = $have.next(); $i.length && $i[0] != $want[0]; $i = $i.next())
						$bulk = $bulk.add($i);
				}
				else
				{
					for (var $i = $want.next(); $i.length && $i[0] != $have[0]; $i = $i.next())
						$bulk = $bulk.add($i);
				}

				d_bulk = $have.outerHeight(true);
				d_have = $bulk.last().offset().top + $bulk.last().outerHeight(true) - $bulk.first().offset().top;

				if (delta < 0) d_bulk = -d_bulk;
				else           d_have = -d_have;

				$have.parent().css({ position: 'relative' });
				$have.css({ position: 'relative', 'z-index': 0 });
				$bulk.css({ position: 'relative', 'z-index': 1 });

				drag.inSwap = 1 + $bulk.length;

				$have.animate({ top: d_have }, drag.swapAnimMs, function(){ if (! --drag.inSwap) swapCleanUp(); });
				$bulk.animate({ top: d_bulk }, drag.swapAnimMs, function(){ if (! --drag.inSwap) swapCleanUp(); });

				function swapCleanUp()
				{
					$have.parent().css({ position: '' });

					$have.remove();
					$want.show();
					$bulk.css({ position: '', 'z-index': '', top: '' });

					drag.adjustDrag();
				}
			}
			else
			{
				drag.inSwap = 1;

				$want.slideDown(drag.swapAnimMs);

				$have.slideUp(drag.swapAnimMs, function() {
					$have.remove();
					drag.inSwap = 0;
					drag.adjustDrag();
				});
			}
		}

		this.onMouseMove = function(ev)
		{
			this.mouseEv = ev;

			if (! this.item)
				return;

			if (this.priming)
			{
				var x = ev.clientX - this.primeXY.x;
				var y = ev.clientY - this.primeXY.y;
				if (x*x + y*y > 5*5)
					this.onPrimed();
			}
			else
			{
				this.adjustDrag();
			}
		}

		this.stopDragging = function()
		{
			var $item = $(this.item);

			$item.removeClass('dragging');
			$('body').removeClass('dragging');

			if (this.$drag)
			{
				this.$drag.remove();
				this.$drag = null;

				removeTextSelection();

				if (this.onDragging)
					this.onDragging.call(this, false); // stopped
			}

			this.item = null;
		}
	}





	function VarAdjust()
	{
		// state
		this.onChange = null;
		this.onFinish = null;
		this.startY = 0;
		this.used = false;

		// api
		this.start = function(ev, onChange, onFinish)
		{
			if (! onChange)
				return;

			this.onChange = onChange;
			this.onFinish = onFinish;
			this.startY = ev.clientY;
			this.used = false;

			var self = this;
			setTimeout(function(){
				if (! self.onChange)
					return;
				$('body').addClass('adjusting');
				self.used = true;
			}, 250);
		}

		this.onMouseMove = function(ev)
		{
			if (! this.onChange)
				return;

			$('body').addClass('adjusting');
			self.used = true;
			this.onChange(ev.clientY - this.startY);
		}

		this.end = function()
		{
			if (! this.onChange)
				return;

			$('body').removeClass('adjusting');
			this.onChange = null;

			if (this.onFinish) this.onFinish();
		}
	}





	/*
	 *	poor man's error handling -- $fixme
	 */
	var easyMartina = false;

	window.onerror = function(message, file, line, col, e){
		var cb1;
		if (! easyMartina) alert("Error occurred: " + e.message);
		return false;
	};

	window.addEventListener("error", function(e) {
		var cb2;
		if (! easyMartina) alert("Error occurred: " + e.error.message);
		return false;
	});

	/*
	 *	notes / lists / boards
	 */
	function addNote($list, $after, $before)
	{
		var $note  = $('tt .note').clone();
		var $notes = $list.find('.notes');

		$note.find('.text').html('');
		$note.addClass('brand-new');

		if ($before && $before.length)
		{
			$before.before($note);
			$note = $before.prev();
		}
		else
		if ($after && $after.length)
		{
			$after.after($note);
			$note = $after.next();
		}
		else
		{
			$notes.append($note);
			$note = $notes.find('.note').last();
		}

		$note.find('.text').click();
	}

	function deleteNote($note)
	{
		$note
		.animate({ opacity: 0 }, 'fast')
		.slideUp('fast')
		.queue(function(){
			$note.remove();
			saveBoard();
		});
	}

	function noteLocation($item)
	{
		var loc = 0;
		for (var $p = $item.closest('.note'); $p.length; $p = $p.prev(), loc += 1);
		for (var $p = $item.closest('.list'); $p.length; $p = $p.prev(), loc += 10000);
		return loc;
	}

	//
	function addList()
	{
		var $board = $('.wrap .board');
		var $lists = $board.find('.lists');
		var $list = $('tt .list').clone();

		$list.find('.text').html('');
		$list.find('.head').addClass('brand-new');

		$lists.append($list);
		$board.find('.lists .list .head .text').last().click();

		var lists = $lists[0];
		lists.scrollLeft = Math.max(0, lists.scrollWidth - lists.clientWidth);

		setupListScrolling();
	}

	function deleteList($list)
	{
		var empty = true;

		$list.find('.note .text').each(function(){
			empty &= ($(this).html().length == 0);
		});

		if (! empty && ! confirm("Delete this list and all its notes?"))
			return;

		$list
		.animate({ opacity: 0 })
		.queue(function(){
			$list.remove();
			saveBoard();
		});

		setupListScrolling();
	}

	function moveList($list, left)
	{
		var $a = $list;
		var $b = left ? $a.prev() : $a.next();

		var $menu_a = $a.find('> .head .menu .bulk');
		var $menu_b = $b.find('> .head .menu .bulk');

		var pos_a = $a.offset().left;
		var pos_b = $b.offset().left;

		$a.css({ position: 'relative' });
		$b.css({ position: 'relative' });

		$menu_a.hide();
		$menu_b.hide();

		$a.animate({ left: (pos_b - pos_a) + 'px' }, 'fast');
		$b.animate({ left: (pos_a - pos_b) + 'px' }, 'fast', function(){

			if (left) $list.prev().before($list);
			else      $list.before($list.next());

			$a.css({ position: '', left: '' });
			$b.css({ position: '', left: '' });

			$menu_a.css({ display: '' });
			$menu_b.css({ display: '' });

			saveBoard();
		});
	}

	//
	function openBoard(board_id)
	{
		closeBoard(true);

		NB.board = NB.storage.loadBoard(board_id, null);
		NB.storage.setActiveBoard(board_id);

		showBoard(true);
	}

	function reopenBoard(revision)
	{
		var board_id = NB.board.id;

		var via_menu = $('.wrap .board > .head .menu .bulk').is(':visible');

		NB.storage.setBoardRevision(board_id, revision);

		openBoard(board_id);

		if (via_menu)
		{
			var $menu = $('.wrap .board > .head .menu');
			var $teaser = $menu.find('.teaser');
			var $bulk = $menu.find('.bulk');

			$teaser.hide().delay(100).queue(function(){ $(this).css('display', '').dequeue(); });
			$bulk.show().delay(100).queue(function(){ $(this).css('display', '').dequeue(); });
		}
	}

	function closeBoard(quick)
	{
		if (! NB.board)
			return;

		var $board = $('.wrap .board');

		if (quick)
			$board.remove();
		else
			$board
			 .animate({ opacity: 0 }, 'fast')
			 .queue(function(){ $board.remove(); });

		NB.board = null;
		NB.storage.setActiveBoard(null);

//		updateUndoRedo();
		updateBoardIndex();
		updatePageTitle();
	}

	//
	function addBoard()
	{
		closeBoard(true);

		NB.board = new Board();

		showBoard(true);

		$('.wrap .board .head').addClass('brand-new');
		$('.wrap .board .head .text').click();
	}

	function saveBoard()
	{
		var $board = $('.wrap .board');
		var board = Object.assign(new Board(), NB.board); // id, revision & title

		board.lists = [];

		$board.find('.list').each(function(){
			var $list = $(this);
			var l = board.addList( getText($list.find('.head .text')) );

			$list.find('.note').each(function(){
				var $note = $(this)
				var n = l.addNote( getText($note.find('.text')) );
				n.raw = $note.hasClass('raw');
				n.min = $note.hasClass('collapsed');
			});
		});

		NB.storage.saveBoard(board);
		NB.board = board;

		updateUndoRedo();
		updateBoardIndex();
		if (window.NBHooks && window.NBHooks.afterSave)
			window.NBHooks.afterSave(board);
	}

	function deleteBoard()
	{
		var $list = $('.wrap .board .list');
		var board_id = NB.board.id;

		if ($list.length && ! confirm("PERMANENTLY delete this board, all its lists and their notes?"))
			return;

		closeBoard();

		NB.storage.nukeBoard(board_id);

		updateBoardIndex();
	}

	//
	function undoBoard()
	{
		if (! NB.board)
			return false;

		var hist = NB.storage.getBoardHistory(NB.board.id);
		var have = NB.board.revision;
		var want = 0;

		for (var i=0; i<hist.length-1 && ! want; i++)
			if (have == hist[i])
				want = hist[i+1];

		if (! want)
		{
			console.log('Undo - failed');
			return false;
		}

		console.log('Undo -> ' + want);

		reopenBoard(want);
		return true;
	}

	function redoBoard()
	{
		if (! NB.board)
			return false;

		var hist = NB.storage.getBoardHistory(NB.board.id);
		var have = NB.board.revision;
		var want = 0;

		for (var i=1; i<hist.length && ! want; i++)
			if (have == hist[i])
				want = hist[i-1];

		if (! want)
		{
			console.log('Redo - failed');
			return false;
		}

		console.log('Redo -> ' + want);

		reopenBoard(want);
		return true;
	}

	//
	function showBoard(quick)
	{
		var board = NB.board;

		var $wrap = $('.wrap');
		var $bdiv = $('tt .board');
		var $ldiv = $('tt .list');
		var $ndiv = $('tt .note');

		var $b = $bdiv.clone();
		var $b_lists = $b.find('.lists');

		$b[0].board_id = board.id;
		setText( $b.find('.head .text'), board.title );

		board.lists.forEach(function(list){

			var $l = $ldiv.clone();
			var $l_notes = $l.find('.notes');

			setText( $l.find('.head .text'), list.title );

			list.notes.forEach(function(n){
				var $n = $ndiv.clone();
				setText( $n.find('.text'), n.text );
				if (n.raw) $n.addClass('raw');
				if (n.min) $n.addClass('collapsed');
				$l_notes.append($n);
			});

			$b_lists.append($l);
		});

		if (quick)
			$wrap.html('').append($b);
		else
			$wrap.html('')
			  .css({ opacity: 0 })
			  .append($b)
			  .animate({ opacity: 1 });

		updatePageTitle();
		updateUndoRedo();
		updateBoardIndex();
		setupListScrolling();
	}

	/*
	 *	demo board
	 */
	function createDemoBoard()
	{
		var demo = {"format": 20190412, "id": 1555071015420, "revision": 581, "title": "Welcome to Nullboard", "lists": [{"title": "The User Manual", "notes": [{"text": "This is a note.\nA column of notes is a list.\nA set of lists is a board.", "raw": false, "min": false}, {"text": "The board lives in this file.\nClose it and come back — the lists are still here.", "raw": false, "min": false}, {"text": "Last 50 board revisions are retained.", "raw": false, "min": false}, {"text": "Ctrl-Z is Undo  -  goes one revision back.\nCtrl-Y is Redo  -  goes one revision forward.", "raw": false, "min": false}, {"text": "On a phone", "raw": true, "min": false}, {"text": "Swipe the lists sideways.\nTap ≡ on a note or a list to open its menu.", "raw": false, "min": false}, {"text": "Tap a note to edit. Tap outside, or Shift-Enter, when you are done.", "raw": false, "min": false}, {"text": "The bar at the bottom adds a note, a list, undoes, or opens Boards.", "raw": false, "min": false}]}, {"title": "Things to try", "notes": [{"text": "•   Click on a note to edit.", "raw": false, "min": false}, {"text": "•   Click outside of it when done editing.\n•   Alternatively, use Shift-Enter.", "raw": false, "min": false}, {"text": "•   To discard changes press Escape.", "raw": false, "min": false}, {"text": "•   Try Ctrl-Enter, see what it does.\n•   Try Ctrl-Shift-Enter too.", "raw": false, "min": false}, {"text": "•   Tap ≡ on a note for X, R, and _.\n•   Hover works the same way on a computer.", "raw": false, "min": false}, {"text": "•   X  deletes the note.\n•   R changes how a note looks.\n•   _  collapses the note.", "raw": false, "min": false}, {"text": "This is a raw note.", "raw": true, "min": false}, {"text": "This is a collapsed note. Only its first line is visible. Useful for keeping lists compact.", "raw": false, "min": true}, {"text": "Links", "raw": true, "min": false}, {"text": "Links pulse on hover. CapsLock or Control highlights them so a click opens them  -  https://nullboard.io", "raw": false, "min": false}]}, {"title": "More things to try", "notes": [{"text": "•   Drag notes around to rearrange.\n•   Works between the lists too.", "raw": false, "min": false}, {"text": "•   Click on a list name to edit.\n•   Enter to save, Esc to cancel.", "raw": false, "min": false}, {"text": "•   Try adding a new list.\n•   Try deleting one. This  _can_  be undone.", "raw": false, "min": false}, {"text": "•   Same for the board name.", "raw": false, "min": false}, {"text": "Boards", "raw": true, "min": false}, {"text": "•   Check out   ≡   at the top right.", "raw": false, "min": false}, {"text": "•   Try adding a new board.\n•   Try switching between the boards.", "raw": false, "min": false}, {"text": "•   Try deleting a board. Unlike deleting a\n     list this  _cannot_  be undone.", "raw": false, "min": false}, {"text": "•   Export the board   (save to a file, as json)\n•   Import the board   (load from a save)", "raw": false, "min": false}, {"text": "A friend", "raw": true, "min": false}, {"text": "Press Invite in the bar above.\nThey land on this same board — no account.", "raw": false, "min": false}]}]};

		if (! demo)
			return false;

		demo.id = +new Date();
		demo.revision = 0;

		NB.storage.saveBoard(demo);
		NB.storage.setActiveBoard(demo.id);

		return Object.assign(new Board(), demo);
	}

	/*
	 *	board export / import
	 */
	function exportBoard()
	{
		var blob, file;

		if (! NB.board)
		{
			var index = NB.storage.getBoardIndex();
			var all = [];

			index.forEach(function(meta, board_id){
				all.push( NB.storage.loadBoard(board_id, null) );
			})

			blob = JSON.stringify(all);
			file = `Nullboard.nbx`;
		}
		else
		{
			var board = NB.board;
			blob = JSON.stringify(board);
			file = `Nullboard-${board.id}-${board.title}.nbx`;
		}

		blob = encodeURIComponent(blob);
		blob = "data:application/octet-stream," + blob;

		return { blob: blob, file: file };
	}

	function checkImport(foo)
	{
		var props = [ 'format', 'id', 'revision', 'title', 'lists' ];

		for (var i=0; i<props.length; i++)
			if (! foo.hasOwnProperty(props[i]))
				return "Required board properties are missing.";

		if (! foo.id || ! foo.revision || ! Array.isArray(foo.lists))
			return "Required board properties are empty.";

		if (foo.format != NB.blobVersion)
			return `Unsupported blob format "${foo.format}", expecting "${NB.blobVersion}".`;

		return null;
	}

	function importBoard(blob)
	{
		var data;

		try
		{
			data = JSON.parse(blob);
		}
		catch (x)
		{
			alert('File is not in a valid JSON format.');
			return false;
		}

		if (! Array.isArray(data))
			data = [ data ];

		var index = NB.storage.getBoardIndex();
		var msg, one, all = '';

		for (var i=0; i<data.length; i++)
		{
			var board = data[i];

			var whoops = checkImport(board);
			if (whoops)
			{
				alert(whoops);
				return false;
			}

			var title = board.title || '(untitled board)';
			one =  `"${title}", ID ${board.id}, revision ${board.revision}`;
			all += `    ID ${board.id}, revision ${board.revision} - "${title}"    \n`;
		}

		if (data.length == 1) msg = `Import a board called ${one} ?`;
		else                  msg = `About to import the following boards:\n\n${all}\nProceed?`;

		if (! confirm(msg))
			return false;

		var to_open = '';

		for (var i=0; i<data.length; i++)
		{
			var board = data[i];
			var check_title = true;

			// check ID

			if (index.has(board.id))
			{
				var which = (data.length == 1) ? "with the same ID" : board.id;

				if (confirm(`Board ${which} already exists. Overwrite it?`) &&
				    confirm(`OVERWRITE for sure?`))
				{
					console.log(`Import: ${board.id} (${board.title} - will overwrite existing one`);
					check_title = false;
				}
				else
				if (confirm(`Import the board under a new ID?`))
				{
					var new_id = +new Date();
					console.log(`Import: ${board.id} (${board.title} - will import as ${new_id}`);
					board.id = new_id;
				}
				else
				{
					console.log(`Import: ${board.id} (${board.title} - ID conflict, will not import`);
					continue;
				}
			}

			if (check_title)
			{
				var retitle = false;
				index.forEach( have => { retitle |= (have.title == board.title) } );

				if (retitle) board.title += ' (imported)';
			}

			// ok, do the deed

			board.revision--; // save will ++ it back

			if (! NB.storage.saveBoard(board)) // this updates 'index'
			{
				alert(`Failed to save board ${board.id}. Import failed.`);
				return false;
			}

			if (! to_open) to_open = data[0].id;
		}

		if (to_open) openBoard(to_open);
	}

	/*
	 *
	 */
	function findBackupAgent(which)
	{
		var a = null;

		NB.storage.backups.agents.forEach(function(agent){
			if (agent.type      == which.type &&
			    agent.conf.auth == which.conf.auth &&
			    agent.conf.base == which.conf.base)
			{
				a = agent;
			}
		});

		return a;
	}

	function setBackupConfigUi($div, backupConf)
	{
		if (! backupConf.enabled)
		{
			$div.addClass('off');
			return;
		}

		var $status = $div.find('.status');
		var b = findBackupAgent(backupConf);
		var text = 'OK';

		if (b && b.status == 'error')
		{
			text = b.lastXhr.text;
			$status.addClass('error');
		}

		$status.find('input').val(text);
		$status.css({ display: 'block' });
	}

	function getBackupConfigUi()
	{
		var conf = NB.storage.getConfig();
		var loc  = conf.backups.agents[0];
		var rem  = conf.backups.agents[1];

		var $div = $('.overlay .backup-conf');
		var $loc = $div.find('.loc');
		var $rem = $div.find('.rem');

		var ret =
		{
			loc: jsonClone(loc),
			rem: jsonClone(rem)
		};

		ret.loc.enabled   = ! $loc.hasClass('off');
		ret.loc.conf.auth = $loc.find('.auth').val();

		ret.rem.enabled   = ! $rem.hasClass('off');
		ret.rem.conf.base = $rem.find('.base').val();
		ret.rem.conf.auth = $rem.find('.auth').val();

		//
		if (ret.loc.enabled && ! ret.loc.conf.auth)
		{
			shakeControl($loc.find('.auth'));
			return null;
		}

		if (ret.rem.enabled && ! ret.rem.conf.base)
		{
			shakeControl($rem.find('.base'));
			return null;
		}

		if (ret.rem.enabled && ! ret.rem.conf.auth)
		{
			shakeControl($rem.find('.auth'));
			return null;
		}

		return ret;
	}

	function checkBackupConfig(backupConf, $div, onDone)
	{
		var $status = $div.find('.status');
		var $text = $status.find('input');

		$text.val('Checking...');
		$status.removeClass('error').slideDown();

		$div.delay(850).queue(function(){

			var T = NB.backupTypes.get(backupConf.type);
			var foo = new T(backupConf.id, backupConf.conf, function(){});

			foo.checkStatus(function(ok){

				if (ok)
				{
					$text.val('OK');
				}
				else
				{
					$text.val(foo.lastXhr.text);
					$status.addClass('error');
				}

				onDone();
			});

			$(this).dequeue();
		});
	}

	function configBackups()
	{
		var conf = NB.storage.getConfig();

		if (conf.backups.agents.length != 2)
			throw 'Invalid conf.backups.agents[]'; // as per fixupConfig()

		//
		var $div = $('tt .backup-conf').clone();
		var  div = $div[0];

		var $loc = $div.find('.loc');
		var $rem = $div.find('.rem');

		var typ = (new SimpleBackup).type;
		var loc = conf.backups.agents[0];
		var rem = conf.backups.agents[1];

		div.checking = 0;

		//
		$loc.find('.auth').val( loc.conf.auth );
		$rem.find('.auth').val( rem.conf.auth );
		$rem.find('.base').val( rem.conf.base );

		setBackupConfigUi($loc, loc);
		setBackupConfigUi($rem, rem);

		if (! loc.enabled && ! rem.enabled)
			$div.addClass('off');

		//
		$div.find('.opt').click(function(){

			var $opt = $(this).parent();

			if ($opt.hasClass('off'))
			{
				$opt.find('.etc')
				.css({ opacity: 0 })
				.slideDown('fast')
				.animate({ opacity: 1 }, 'fast')
				.queue(function(){
					$opt.removeClass('off');
					$div.removeClass('off');
					$(this).css('opacity', '').dequeue();
				})

				$opt.find('input').first()
				.delay(800)
				.queue(function(){ $(this).focus().dequeue(); });
			}
			else
			{
				$opt.find('.etc')
				.animate({ opacity: 0 }, 'fast')
				.slideUp('fast')
				.queue(function(){
					$opt.addClass('off');
					if ($loc.hasClass('off') && $rem.hasClass('off'))
						$div.addClass('off');
					$(this).css({ opacity: '' }).dequeue();
				})
			}

			return false;
		});

		$div.find('.check').click(function(){

			if (div.checking)
				return false;

			var foo = getBackupConfigUi();
			if (! foo)
				return false;

			if (foo.loc.enabled)
			{
				div.checking++;
				checkBackupConfig(foo.loc, $loc, function(){ div.checking--; });
			}

			if (foo.rem.enabled)
			{
				div.checking++;
				checkBackupConfig(foo.rem, $rem, function(){ div.checking--; });
			}

			return false;
		});

		$div.find('.ok').click(function(){

			var foo = getBackupConfigUi();
			if (! foo)
				return false;

			if (foo.loc.enabled && ! loc.enabled)
				foo.loc.id = typ + '-' + (conf.backups.nextId++);

			if (foo.rem.enabled && ! rem.enabled)
				foo.rem.id = typ + '-' + (conf.backups.nextId++);

			conf.backups.agents[0] = foo.loc;
			conf.backups.agents[1] = foo.rem;

			NB.storage.initBackups(onBackupStatusChange);
			NB.storage.saveConfig();

			hideOverlay();
		});

		$div.find('a.close').click(function(){
			hideOverlay();
		});

		showOverlay($div);
	}

	function onBackupStatusChange(agent)
	{
		var agents = NB.storage.backups.agents;

		var $config = $('.config');
		var $status = $('.config .teaser u')

//		if (agent) console.log( `onBackupStatusChange: ${agent.id}, status ${agent.status}, op ${agent.lastOp}, xhr '${agent.lastXhr.text}' / ${agent.lastXhr.code}` );
//		else       console.log( `onBackupStatusChange: <generic>` );

		if (! agents.length)
		{
			$config.removeClass('backups-on backup-err backing-up');
			return;
		}

		$config.addClass('backups-on');

		var busy  = 0;
		var error = 0;
		var ready = 0;

		agents.forEach(function(agent){
			if (agent.status == 'busy')  busy++;  else
			if (agent.status == 'error') error++; else
			if (agent.status == 'ready') ready++; else
				throw `Unknown status [${agent.status}] on backup agent ${agent.id}`;
		});

		if (error > 0) $config.addClass('backup-err').removeClass('backing-up'); else
		if (busy > 0)  $config.addClass('backing-up').removeClass('backup-err'); else
		               $config.removeClass('backing-up backup-err');

		// process all pending backups if needed

		if (! error && ! busy)
			runPendingBackups();
	}

	function needsBackingUp(backupStatus, fields, agentIds)
	{
		var stale = false;
		agentIds.forEach(function(id){
			var obj = backupStatus[id];
			if (obj) fields.forEach(function(f){ stale = !obj[f]; });
			else stale = true;
		});

		return stale;
	}

	function runPendingBackups()
	{
		console.log('Checking for pending backups...');

		var conf = NB.storage.getConfig();

		var agentIds = [];
		NB.storage.backups.agents.forEach(function(agent){
			agentIds.push(agent.id);
		});

		if (needsBackingUp(conf.backupStatus, [ 'conf' ], agentIds))
		{
			console.log("  Backing up app config...");
			NB.storage.backupConfig();
		}

		var boards = NB.storage.getBoardIndex();

		boards.forEach(function(meta, id){

			if (! needsBackingUp(meta.backupStatus, [ 'data', 'meta' ], agentIds))
				return;

			console.log(`  Backing up board ${id}...`);

			var board = NB.storage.loadBoard(id);
			if (! board)
				return;

			NB.storage.backupBoard(id, board, meta)
		});
	}

	/*
	 *
	 */
	function saveBoardOrder()
	{
		var $index = $('.config .load-board');
		var spot = 1;

		$index.each(function(){
			var id = parseInt( $(this).attr('board_id') );
			NB.storage.setBoardUiSpot(id, spot++);
		});
	}

	/*
	 *
	 */
	function updatePageTitle()
	{
		var title = 'Nullboard';

		if (NB.board)
		{
			title = NB.board.title;
			title = 'NB - ' + (title || '(untitled board)');
		}

		document.title = title;
	}

	function updateUndoRedo()
	{
		var $undo = $('.board .menu .undo-board');
		var $redo = $('.board .menu .redo-board');

		var undo = false;
		var redo = false;

		if (NB.board && NB.board.revision)
		{
			var history = NB.storage.getBoardHistory(NB.board.id);
			var rev = NB.board.revision;

			undo = (rev != history[history.length-1]);
			redo = (rev != history[0]);
		}

		if (undo) $undo.show(); else $undo.hide();
		if (redo) $redo.show(); else $redo.hide();
	}

	function updateBoardIndex()
	{
		var $index  = $('.config .boards');
		var $export = $('.config .exp-board');
		var $backup = $('.config .auto-backup');
		var $entry  = $('tt .load-board');

		var $board = $('.wrap .board');
		var id_now = NB.board && NB.board.id;
		var empty = true;

		$index.html('');
		$index.hide();

		var boards = NB.storage.getBoardIndex();
		var index = [];

		boards.forEach(function(meta, id){ index.push({ id: id, meta: meta }); });

		index.sort(function(a, b){ return b.meta.ui_spot && a.meta.ui_spot > b.meta.ui_spot; });

		index.forEach(function(entry){

			var $e = $entry.clone();
			$e.attr('board_id', entry.id);
			$e.html(entry.meta.title);

			if (entry.id == id_now)
				$e.addClass('active');

			$index.append($e);
			empty = false;
		});

		if (! empty)
		{
			if (id_now) $export.html('Export this board...').show();
			else        $export.html('Export all boards...').show();
			$backup.show();
		}
		else
		{
			$export.hide();
			$backup.hide();
		}

		if (! empty) $index.show();
	}

	function setWhatsNew()
	{
		var conf = NB.storage.getConfig();

		if (conf.verSeen && conf.verSeen < NB.codeVersion)
		{
			$('.logo').addClass('updated');
			$('.logo .alert').html("(updated)");
		}

		var $link = $('.logo .view-changes');
		var link = $link.attr('href') + '/?have=' + NB.codeVersion;
		if (conf.verSeen) link += '&seen=' + conf.verSeen;
		if (conf.verLast) link += '&last=' + conf.verLast;
		$link.attr('href', link);
	}

	/*
	 *	generic utils
	 */
	function jsonMatch(a, b)
	{
		return JSON.stringify(a) == JSON.stringify(b);
	}

	function jsonClone(x)
	{
		return JSON.parse(JSON.stringify(x));
	}

	function htmlEncode(raw)
	{
		return $('tt .encoder').text(raw).html();
	}

	function setText($note, text)
	{
		$note.attr('_text', text);

		text = htmlEncode(text);

		var hmmm = /\b(https?:\/\/[^\s]+)/mg;
		text = text.replace(hmmm, function(url){
			return '<a href="' + url + '" target=_blank>' + url + '</a>';
		});

		if ( NB.peek('fileLinks') )
		{
			var xmmm = /`(.*?)`/mg;
			text = text.replace(xmmm, function(full, text){
				link = 'file:///' + text.replace('\\', '/');
				return '`<a href="' + link + '" target=_blank>' + text + '</a>`';
			});
		}

		$note.html(text); // ? text : ' ');
	}

	function getText($note)
	{
		return $note.attr('_text');
	}

	function removeTextSelection()
	{
		if (window.getSelection) { window.getSelection().removeAllRanges(); }
		else if (document.selection) { document.selection.empty(); }
	}

	function shakeControl($x)
	{
		$x
		.css({ position: 'relative' })
		.focus()
		.animate({ left: '+4px' }, 60)
		.animate({ left: '-3px' }, 60)
		.animate({ left: '+2px' }, 60)
		.animate({ left:  '0px' }, 60)
		.queue(function(){
			$x.css({ position: '', left: '' }).dequeue();
		});
	}

	/*
	 *	inline editing
	 */
	function startEditing($text, ev)
	{
		var $note = $text.parent();
		var $edit = $note.find('.edit');

		$note[0]._collapsed = $note.hasClass('collapsed');
		$note.removeClass('collapsed');

		$edit.val( getText($text) );
		$edit.width( $text.width() );

		$edit.height( $text.height() );
		$note.addClass('editing');

		$edit.focus();
	}

	function stopEditing($edit, via_escape, via_xclick)
	{
		var $item = $edit.parent();
		if (! $item.hasClass('editing'))
			return;

		$item.removeClass('editing');
		if ($item[0]._collapsed)
			$item.addClass('collapsed')

		//
		var $text = $item.find('.text');
		var text_now = $edit.val().trimRight();
		var text_was = getText( $text );

		//
		var brand_new = $item.hasClass('brand-new');
		$item.removeClass('brand-new');

		if (via_escape)
		{
			if (brand_new)
				$item.closest('.note, .list, .board').remove();
			return;
		}

		if (via_xclick && brand_new && !text_now.length)
		{
			$item.closest('.note, .list, .board').remove();
			return;
		}

		if (text_now != text_was || brand_new)
		{
			setText( $text, text_now );

			if ($item.parent().hasClass('board'))
				NB.board.title = text_now;

			updatePageTitle();
			saveBoard();
		}

		//
		if (brand_new && $item.hasClass('list'))
			addNote($item);
	}

	function handleTab(ev)
	{
		var $this = $(this);
		var $note = $this.closest('.note');
		var $sibl = ev.shiftKey ? $note.prev() : $note.next();

		if ($sibl.length)
		{
			stopEditing($this, false, false);
			$sibl.find('.text').click();
		}
	}

	//
	function setRevealState(ev)
	{
		var raw = ev.originalEvent;
		var do_reveal = raw.getModifierState && (raw.getModifierState( 'CapsLock' ) || raw.getModifierState( 'Control' ));

		if (do_reveal) $('body').addClass('reveal');
		else           $('body').removeClass('reveal');
	}

	//
	function showDing()
	{
		$('body')
		.addClass('ding')
		.delay(250)
		.queue(function(){ $(this).removeClass('ding').dequeue(); });
	}

	/*
	 *	overlay
	 */
	function showOverlay($div)
	{
		$('.overlay')
		.html('')
		.append($div)
		.css({ opacity: 0, display: 'flex' })
		.animate({ opacity: 1 });
	}

	function hideOverlay()
	{
		$('.overlay').animate({ opacity: 0 }, function(){
			$(this).hide();
		});
	}

	function haveOverlay()
	{
		return $('.overlay').css('display') != 'none';
	}

	/*
	 *	license popup
	 */
	function formatLicense()
	{
		var text = '';
		var nodes = document.head.childNodes;
		for (var i = 0; i < nodes.length; i++)
		{
			if (nodes[i].nodeType === 8 && /LICENSE/.test(nodes[i].nodeValue || ''))
			{
				text = nodes[i].nodeValue;
				break;
			}
		}
		if (! text) return '<p>Nullboard, BSD-2-Clause with Commons Clause. Alexander Pankratov / swapped.ch</p>';
		var pos = text.search('LICENSE');
		var qos = text.search('Software:');
		var bulk;

		bulk = text.substr(pos, qos-pos);
		bulk = bulk.replace(/([^\n])\n\t/g, '$1 ');
		bulk = bulk.replace(/\n\n\t/g, '\n\n');
		bulk = bulk.replace(/([A-Z ]{7,})/g, '<u>$1</u>');

		//
		var c1 = [];
		var c2 = [];

		text.substr(qos).trim().split('\n').forEach(function(line){
			line = line.split(':');
			c1.push( line[0].trim() + ':' );
			c2.push( line[1].trim() );
		});

		bulk += '<span>' + c1.join('<br>') + '</span>';
		bulk += '<span>' + c2.join('<br>') + '</span>';

		//
		var links =
		[
			{ text: '2-clause BSD license', href: 'https://opensource.org/licenses/BSD-2-Clause/' },
			{ text: 'Commons Clause',       href: 'https://commonsclause.com/' }
		];

		links.forEach(function(l){
			bulk = bulk.replace(l.text, '<a href="' + l.href + '" target=_blank>' + l.text + '</a>');
		});

		return bulk.trim();
	}

	/*
	 *	adjust this and that
	 */
	function adjustLayout()
	{
		var $body = $('body');
		var $board = $('.board');

		if (! $board.length)
			return;

		var list_w = getListWidth();

		var lists = $board.find('.list').length;
		var lists_w = (lists < 2) ? list_w : (list_w + 10) * lists - 10;
		var body_w = $body.width();

		if (lists_w + 190 <= body_w)
		{
			$board.css('max-width', '');
			$body.removeClass('crowded');
		}
		else
		{
			var max = Math.floor( (body_w - 40) / (list_w + 10) );
			max = (max < 2) ? list_w : (list_w + 10) * max - 10;
			$board.css('max-width', max + 'px');
			$body.addClass('crowded');
		}
	}

	//
	function adjustListScroller()
	{
		var $board = $('.board');
		if (! $board.length)
			return;

		var $lists    = $('.board .lists');
		var $scroller = $('.board .lists-scroller');
		var $inner    = $scroller.find('div');

		var max  = $board.width();
		var want = $lists[0].scrollWidth;
		var have = $inner.outerWidth();

		if (want <= max+5)
		{
			$scroller.hide();
			return;
		}

		$scroller.show();
		if (want == have)
			return;

		$inner.width(want);
		cloneScrollPos($lists, $scroller);
	}

	function cloneScrollPos($src, $dst)
	{
		var src = $src[0];
		var dst = $dst[0];

		if (src._busyScrolling)
		{
			src._busyScrolling--;
			return;
		}

		dst._busyScrolling++;
		dst.scrollLeft = src.scrollLeft;
	}

	function setupListScrolling()
	{
		var $lists    = $('.board .lists');
		var $scroller = $('.board .lists-scroller');

		adjustListScroller();

		$lists[0]._busyScrolling = 0;
		$scroller[0]._busyScrolling = 0;

		$scroller.on('scroll', function(){ cloneScrollPos($scroller, $lists); });
		$lists   .on('scroll', function(){ cloneScrollPos($lists, $scroller); });

		adjustLayout();
	}

	/*
	 *	dragsters
	 */
	function initDragAndDrop()
	{
		NB.noteDrag = new Drag2();
		NB.noteDrag.listSel = '.board .list .notes';
		NB.noteDrag.itemSel = '.note';
		NB.noteDrag.dragster = 'note-dragster';
		NB.noteDrag.onDragging = function(started)
		{
			var drag = this;
			var $note = $(drag.item);

			if (started)
			{
				var $drag = drag.$drag;

				if ($note.hasClass('collapsed'))
					$drag.addClass('collapsed');

				$drag.html('<div class=text></div>');
				$drag.find('.text').html( $note.find('.text').html() );

				drag.org_loc = noteLocation($note);
				if ($note.hasClass('collapsed'))
					drag.$drag.addClass('collapsed');
			}
			else
			{
				if (this.org_loc != noteLocation($note))
					saveBoard();
			}
		}

		NB.loadDrag = new Drag2();
		NB.loadDrag.listSel = '.config .boards';
		NB.loadDrag.itemSel = 'a.load-board';
		NB.loadDrag.dragster = 'load-dragster';
		NB.loadDrag.onDragging = function(started)
		{
			var drag = this;

			if (started)
			{
				var $drag = drag.$drag;

				$('.config .teaser').css({ display: 'none' });
				$('.config .bulk').css({ display: 'block', opacity: 1 });
				$drag.html( $(this.item).html() );
			}
			else
			{
				$('.config .teaser').css({ display: '' });
				$('.config .bulk')
					.show()
					.delay(250)
					.queue(function(){ $(this).css({ display: '', opacity: '' }).dequeue(); });
				saveBoardOrder();
			}
		}
	}

	/*
	 *	fonts
	 */
	function initFonts()
	{
		var toGo = 0;
		var loaded = [];
		var failed = [];

		NB.font = null; // current font

		//
		function isUsable(f)
		{
			return ! failed.includes(f) && loaded.includes(f);
		}

		function onFontsLoaded()
		{
			var conf = NB.storage.getConfig();

			$('.config .switch-font').each(function(){
				if (! isUsable($(this).attr('font')))
					$(this).remove();
			});

			if (conf.fontName && ! isUsable(conf.fontName))
			{
				NB.storage.setFontName(null);
				selectFont(null);
			}

			selectFont(conf.fontName || 'barlow');

			if (conf.fontSize)
				setFontSize(conf.fontSize);

			if (conf.lineHeight)
				setLineHeight(conf.lineHeight);

			if (conf.listWidth)
				setListWidth(conf.listWidth);

			updateVarsAndLayout();
		}

		function onFontLoaded(f, ok)
		{
			var m = f.family.match(/["']?f-([^"']*)/);
			var f_name = m ? m[1] : ''; /* ios safari will set 'family' to 'weight' on failure ! */
			if (! ok)
			{
				console.log( `! Failed to load ${f.family} ${f.weight}` );
				failed.push(f_name);
			}
			else
			{
				loaded.push(f_name);
			}

			if (! --toGo)
				onFontsLoaded();
		}

		document.fonts.forEach(function(f){

			var m0 = (f.family || '').match(/["']?f-([^"']*)/);
			var fname = m0 ? m0[1] : '';

			if (f.status == 'loaded')
			{
				if (fname && loaded.indexOf(fname) < 0) loaded.push(fname);
				return;
			}

			console.log( `Loading ${f.family} ${f.weight} ...` );
			toGo++;
			f.load()
			 .then(function(){ onFontLoaded(f, true); })
			 .catch(function(){ onFontLoaded(f, false); });
		});

		if (! toGo)
			onFontsLoaded();
	}

	function selectFont(font)
	 {
		var $html = $('html');
		$html.removeClass('f-' + NB.font).addClass('f-' + font);
		NB.font = font;

		var $list = $('.config .switch-font');
		$list.removeClass('active');
		$list.filter('[font="' + font + '"]').addClass('active');

		updateVarsAndLayout();
	}

	//
	function getVar(name)
	{
		var v = $('html').css(name);
		var m = v.match(/^\s*calc\((.*)\)$/);
		if (m) v = eval(m[1]);
		return parseFloat( v );
	}

	function getFontSize()
	{
		return getVar('--fs');
	}

	function getLineHeight()
	{
		return getVar('--lh');;
	}

	function getListWidth()
	{
		return parseInt( getVar('--lw') );
	}

	//
	function updateFontSize()
	{
		var val = getFontSize();
		$('.config .f-prefs .ui-fs .val').html( val.toFixed(1) );
		return val;
	}

	function updateLineHeight()
	{
		var val = getLineHeight();
		$('.config .f-prefs .ui-lh .val').html( val.toFixed(1) );
		return val;
	}

	function updateListWidth()
	{
		var val = getListWidth();
		$('.config .f-prefs .ui-lw .val').html( val.toFixed(0) );
		return val;
	}

	function updateVarsAndLayout()
	{
		updateFontSize();
		updateLineHeight();
		updateListWidth();
		adjustLayout();
	}

	//
	function setFontSize(fs)
	{
		fs = fs.clamp(9, 24);

		$('html').css('--fs', fs + '').addClass('fs-set');
		updateVarsAndLayout();

		if (getLineHeight() < fs)
			setLineHeight(fs);

		return getFontSize();
	}

	function setLineHeight(lh)
	{
		var fs = getFontSize();

		lh = parseInt(10*lh) / 10.; // trim to a single decimal digit
		lh  = lh.clamp(fs, 3*fs);

		$('html').css('--lh', lh + '').addClass('lh-set');
		updateVarsAndLayout();

		return getLineHeight();
	}

	function setListWidth(lw)
	{
		lw = lw.clamp(200, 400);

		$('html').css('--lw', lw + '').addClass('lw-set');
		updateVarsAndLayout();
		return getListWidth();
	}

	//
	function resetFontSize()
	{
		$('html').css('--fs', '').removeClass('fs-set');
		updateVarsAndLayout();
		return updateFontSize();
	}

	function resetLineHeight()
	{
		$('html').css('--lh', '').removeClass('lh-set');
		updateVarsAndLayout();
		return updateLineHeight();
	}

	function resetListWidth()
	{
		$('html').css('--lw', '').removeClass('lw-set');
		updateVarsAndLayout();
		return updateListWidth();
	}

	//
	function saveUiPrefs()
	{
		var $html = $('html');
		NB.storage.setFontSize   ( $html.hasClass('fs-set') ? getFontSize()   : null );
		NB.storage.setLineHeight ( $html.hasClass('lh-set') ? getLineHeight() : null );
		NB.storage.setListWidth  ( $html.hasClass('lw-set') ? getListWidth()  : null );
	}

	/*
	 *	event handlers
	 */
	$(window).on('blur', function(){
		$('body').removeClass('reveal');
	});

	$(document).on('keydown', function(ev){
		setRevealState(ev);
	});

	$(document).on('keyup', function(ev){

		var raw = ev.originalEvent;

		setRevealState(ev);

		if (ev.target.nodeName == 'TEXTAREA' ||
		    ev.target.nodeName == 'INPUT')
			return;

		if (ev.ctrlKey && (raw.code == 'KeyZ'))
		{
			var ok = ev.shiftKey ? redoBoard() : undoBoard();
			if (! ok)
				showDing();
		}
		else
		if (ev.ctrlKey && (raw.code == 'KeyY'))
		{
			if (! redoBoard())
				showDing();
		}
	});

	$('.wrap').on('click', '.board .text', function(ev){

		if (this.was_dragged)
		{
			this.was_dragged = false;
			return false;
		}

		NB.noteDrag.cancelPriming();

		startEditing($(this), ev);
		return false;
	});

	$('.wrap').on('click', '.board .note .text a', function(ev){

		if (! $('body').hasClass('reveal'))
			return true;

		ev.stopPropagation();
		return true;
	});

	//
	$('.wrap').on('keydown', '.board .edit', function(ev){

		var $this = $(this);
		var $note = $this.closest('.note');
		var $list = $this.closest('.list');

		var isNote = $note.length > 0;
		var isList = $list.length > 0;

		// esc
		if (ev.keyCode == 27)
		{
			stopEditing($this, true, false);
			return false;
		}

		// tab
		if (ev.keyCode == 9)
		{
			handleTab.call(this, ev);
			return false;
		}

		// done
		if (ev.keyCode == 13 && ev.altKey ||
		    ev.keyCode == 13 && ev.shiftKey && ! ev.ctrlKey)
		{
			stopEditing($this, false, false);
			return false;
		}

		// done + (add after / add before)
		if (ev.keyCode == 13 && ev.ctrlKey)
		{
			stopEditing($this, false, false);

			if (isNote)
			{
				if (ev.shiftKey) // ctrl-shift-enter
					addNote($list, null, $note);
				else
					addNote($list, $note);
			}
			else
			if (isList)
			{
				$note = $list.find('.note').last();
				addNote($list, $note);
			}
			else
			{
				addList();
			}

			return false;
		}

		// done on Enter if editing board or list title
		if (ev.keyCode == 13 && ! isNote)
		{
			stopEditing($this, false, false);
			return false;
		}

		// done + collapse
		if (isNote && ev.altKey && ev.key == 'ArrowUp')
		{
			var $item = $this.parent();
			$item[0]._collapsed = true;
			stopEditing($this, false, false);
			return false;
		}

		// done + expand
		if (isNote && ev.altKey && ev.key == 'ArrowDown')
		{
			var $item = $this.parent();
			$item[0]._collapsed = false;
			stopEditing($this, false, false);
			return false;
		}

		// done + toggle 'raw'
		if (isNote && ev.altKey && ev.keyCode == 82)
		{
			$this.parent().toggleClass('raw');
			stopEditing($this, false, false);
			return false;
		}

		// ctrl-shift-8
		if (isNote && ev.key == '*' && ev.ctrlKey)
		{
			var have = this.value;
			var pos  = this.selectionStart;
			var want = have.substr(0, pos) + '\u2022 ' + have.substr(this.selectionEnd);
			$this.val(want);
			this.selectionStart = this.selectionEnd = pos + 2;
			return false;
		}

		return true;
	});

	$('.wrap').on('keypress', '.board .edit', function(ev){

		// tab
		if (ev.keyCode == 9)
		{
			handleTab.call(this, ev);
			return false;
		}
	});

	//
	$('.wrap').on('blur', '.board .edit', function(ev){
		if (document.activeElement != this)
			stopEditing($(this), false, true);
		else
			; // switch away from the browser window
	});

	//
	$('.wrap').on('input propertychange', '.board .note .edit', function(){

		var delta = $(this).outerHeight() - $(this).height();

		$(this).height(10);

		if (this.scrollHeight > this.clientHeight)
			$(this).height(this.scrollHeight - delta);
	});

	//
	$('.config').on('click', '.add-board', function(){
		addBoard();
		return false;
	});

	$('.config').on('click', '.load-board', function(){

		var board_id = parseInt( $(this).attr('board_id') );

		NB.loadDrag.cancelPriming();

		if (NB.board && (NB.board.id == board_id))
			closeBoard();
		else
			openBoard(board_id);

		return false;
	});

	$('.wrap').on('click', '.board .del-board', function(){
		deleteBoard();
		return false;
	});

	$('.wrap').on('click', '.board .undo-board', function(){
		undoBoard();
		return false;
	});

	$('.wrap').on('click', '.board .redo-board', function(){
		redoBoard();
		return false;
	});

	//
	$('.wrap').on('click', '.board .add-list', function(){
		addList();
		return false;
	});

	$('.wrap').on('click', '.board .del-list', function(){
		deleteList( $(this).closest('.list') );
		return false;
	});

	$('.wrap').on('click', '.board .mov-list-l', function(){
		moveList( $(this).closest('.list'), true );
		return false;
	});

	$('.wrap').on('click', '.board .mov-list-r', function(){
		moveList( $(this).closest('.list'), false );
		return false;
	});

	//
	$('.wrap').on('click', '.board .add-note', function(){
		addNote( $(this).closest('.list') );
		return false;
	});

	$('.wrap').on('click', '.board .del-note', function(){
		deleteNote( $(this).closest('.note') );
		return false;
	});

	$('.wrap').on('click', '.board .raw-note', function(){
		$(this).closest('.note').toggleClass('raw');
		saveBoard();
		return false;
	});

	$('.wrap').on('click', '.board .collapse', function(){
		$(this).closest('.note').toggleClass('collapsed');
		saveBoard();
		return false;
	});

	//
	$('.wrap').on('mousedown', '.board .note .text', function(ev){
		NB.noteDrag.prime(this.parentNode, ev);
	});

	$('.config').on('mousedown', 'a.load-board', function(ev){
		if ($('.config a.load-board').length > 1)
			NB.loadDrag.prime(this, ev);
	});

	//
	$('.config').on('mousedown', '.ui-fs .val', function(ev){
		var org = getFontSize();
		NB.varAdjust.start(ev, function(delta){ setFontSize( org + delta/50. ); }, saveUiPrefs);
	});

	$('.config').on('mousedown', '.ui-lh .val', function(ev){
		var org = getLineHeight();
		NB.varAdjust.start(ev, function(delta){ setLineHeight( org + delta/50. ); }, saveUiPrefs);
	});

	$('.config').on('mousedown', '.ui-lw .val', function(ev){
		var org = getListWidth();
		NB.varAdjust.start(ev, function(delta){ setListWidth( org + delta/5. ); }, saveUiPrefs);
	});

	//
	$(document).on('mouseup', function(ev){
		NB.noteDrag.end();
		NB.loadDrag.end();
		NB.varAdjust.end();
	});

	$(document).on('mousemove', function(ev){
		setRevealState(ev);
		NB.noteDrag.onMouseMove(ev);
		NB.loadDrag.onMouseMove(ev);
		NB.varAdjust.onMouseMove(ev);
	});

	//
	$('.config .imp-board').on('click', function(ev){
		$('.config .imp-board-select').click();
		return false;
	});

	$('.config .imp-board-select').on('change' , function(){
		var files = this.files;
		var reader = new FileReader();
		reader.onload = function(ev){ importBoard(ev.target.result); };
		reader.readAsText(files[0]);
		return true;
	});

	$('.config .exp-board').on('click', function(){
		var pack = exportBoard();
		$(this).attr('href', pack.blob);
		$(this).attr('download', pack.file);
		return true;
	});

	$('.config .auto-backup').on('click', function(){
		configBackups();
	});

	//
	$('.config .section .title').on('click', function(){
		$(this).closest('.section').toggleClass('open');
		return false;
	});

	$('.config').on('click', '.switch-font', function(){
		var font = $(this).attr('font');
		selectFont(font);
		NB.storage.setFontName(font);
		return false;
	});

	//
	$('.config .f-prefs .ui-fs .less').on('click', function(){
		setFontSize( parseInt(10*getFontSize()) / 10. - 0.5 );
		saveUiPrefs();
		return false;
	});

	$('.config .f-prefs .ui-fs .val').on('click', function(){
		if (NB.varAdjust.used) return false;
		var fs = resetFontSize();
		if (getLineHeight() < fs) setLineHeight(fs);
		saveUiPrefs();
		return false;
	});

	$('.config .f-prefs .ui-fs .more').on('click', function(){
		setFontSize( parseInt(10*getFontSize()) / 10. + 0.5 );
		saveUiPrefs();
		return false;
	});

	//
	$('.config .f-prefs .ui-lh .less').on('click', function(){
		setLineHeight( parseInt(10*getLineHeight()) / 10. - 0.1 );
		saveUiPrefs();
		return false;
	});

	$('.config .f-prefs .ui-lh .val').on('click', function(){
		if (NB.varAdjust.used) return false;
		var lh = resetLineHeight();
		if (lh < getFontSize()) setFontSize(lh);
		saveUiPrefs();
		return false;
	});

	$('.config .f-prefs .ui-lh .more').on('click', function(){
		setLineHeight( parseInt(10*getLineHeight()) / 10. + 0.1 );
		saveUiPrefs();
		return false;
	});

	//
	$('.config .f-prefs .ui-lw .less').on('click', function(){
		setListWidth( getListWidth() - 5 );
		saveUiPrefs();
		return false;
	});

	$('.config .f-prefs .ui-lw .val').on('click', function(){
		if (NB.varAdjust.used) return false;
		resetListWidth();
		saveUiPrefs();
		return false;
	});

	$('.config .f-prefs .ui-lw .more').on('click', function(){
		setListWidth( getListWidth() + 5 );
		saveUiPrefs();
		return false;
	});

	//
	$('.config .switch-theme').on('click', function() {
		var $html = $('html');
		$html.toggleClass('theme-dark');
		NB.storage.setTheme($html.hasClass('theme-dark') ? 'dark' : '');
		return false;
	});

	//
	$('.overlay').click(function(ev){
		if (ev.originalEvent.target != this)
			return true;
		hideOverlay();
		return false;
	});

	$(window).keydown(function(ev){
		if (haveOverlay() && ev.keyCode == 27)
			hideOverlay();
	});

	$('.view-about').click(function(){
		var $div = $('tt .about').clone();
		$div.find('div').html(`Version ${NB.codeVersion}`);
		showOverlay($div);
		return false;
	});

	$('.view-license').click(function(){

		var $div = $('tt .license').clone();
		$div.html(formatLicense());
		showOverlay($div);
		return false;
	});

	$('.view-changes').click(function(){
		if (! $('.logo').hasClass('updated'))
			return;
		NB.storage.setVerSeen();
		$('.logo').removeClass('updated');
	});

	/***/

	$(window).resize(adjustLayout);

	$('body').on('dragstart', function(){ return false; });


	var NB;
	window.startNullboard = function () {
	if (NB && NB.storage) return;
	NB = window.NB =
	{
		codeVersion: 20231105,
		blobVersion: 20190412, // board blob format in Storage
		board: null,
		storage: null,

		peek: function(name)
		{
			return this.storage.getConfig()[name];
		},

		poke: function(name, val)
		{
			var conf = this.storage.getConfig();
			conf[name] = val;
			return this.storage.saveConfig();
		}
	};

	NB.storage = new Storage_Local();

	if (! NB.storage.open())
	{
		easyMartina = true;
		throw new Error();
	}

	var boards = NB.storage.getBoardIndex();

	boards.forEach( function(meta, board_id) {
		var hist = meta.history.join(', ');
		console.log( `Found board ${board_id} - "${meta.title}", revision ${meta.current}, history [${hist}], backup ${JSON.stringify(meta.backupStatus)}` );
	});

	//
	var conf = NB.storage.getConfig();

	console.log( `Active:    [${conf.board}]` );
	console.log( `Theme:     [${conf.theme}]` );
	console.log( `Font:      [${conf.fontName}], size [${conf.fontSize || '-'}], line-height [${conf.lineHeight || '-'}]` );
	console.log( `FileLinks: [${conf.fileLinks}]` );
	console.log( 'Backups:   ', conf.backups);

	/*
	 *	backups
	 */
	NB.backupTypes = new Map();
	NB.backupTypes.set( (new SimpleBackup).type, SimpleBackup );

	NB.storage.initBackups(onBackupStatusChange);

	/*
	 *	the ui
	 */
	initFonts();

	initDragAndDrop();

	NB.varAdjust = new VarAdjust()

	//
	if (conf.theme)
		$('html').addClass('theme-' + conf.theme);

	if (conf.board)
		openBoard(conf.board);

	adjustLayout();

	updateBoardIndex();

	setWhatsNew();

	NB.storage.setVerLast();

	//
	if (! NB.board && ! $('.config .load-board').length)
		NB.board = createDemoBoard();

	if (NB.board)
		showBoard(true);

	//
	setInterval(adjustListScroller, 100);

	setupListScrolling();

		window.NB = NB;
		window.NBApp = {
			addNote: function () {
				var $l = $('.board .list').last();
				if ($l.length) addNote($l);
				else addList();
			},
			addList: addList,
			undo: undoBoard,
			redo: redoBoard,
			addBoard: addBoard,
			toggleBoards: function () {
				$('.config').toggleClass('open');
			}
		};
	};

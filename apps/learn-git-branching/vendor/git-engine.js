/* Headless Learn Git Branching engine.
 * Semantics follow pcottle/learnGitBranching src/js/git (MIT, Peter Cottle).
 * Tree JSON is the original format; command behaviour matches HeadlessGit.
 */
(function (root) {
  'use strict';

  var ORIGIN = 'o/';

  function GitError(msg) { this.kind = 'error'; this.msg = String(msg); }
  function CommandResult(msg) { this.kind = 'result'; this.msg = String(msg == null ? '' : msg); }
  GitError.prototype = Object.create(Error.prototype);
  CommandResult.prototype = Object.create(Error.prototype);

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  var DEFAULT_TREE = {
    branches: { main: { target: 'C1', id: 'main' } },
    commits: {
      C0: { parents: [], id: 'C0', rootCommit: true },
      C1: { parents: ['C0'], id: 'C1' }
    },
    HEAD: { id: 'HEAD', target: 'main' }
  };

  function unescapeTree(s) {
    if (s == null || s === '') return deepCopy(DEFAULT_TREE);
    if (typeof s !== 'string') return JSON.parse(JSON.stringify(s));
    s = s.replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
    try { return JSON.parse(s); } catch (e) {}
    try { return JSON.parse(decodeURIComponent(s)); } catch (e2) {}
    return JSON.parse(s.replace(/%([0-9A-Fa-f]{2})/g, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    }));
  }

  function isObjEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /* ── tree compare (src/js/graph/treeCompare.js) ── */

  var Compare = {};

  Compare.getBaseRef = function (ref) {
    var bits = /^C(\d+)/.exec(ref);
    if (!bits) throw new Error('no regex matchy for ' + ref);
    return 'C' + bits[1];
  };

  Compare.getNumHashes = function (ref) {
    var m = /^C(\d+)([']{0,3})$/.exec(ref);
    if (m) return m[2] ? m[2].length : 0;
    m = /^C(\d+)['][\^](\d+)$/.exec(ref);
    if (m) return Number(m[2]);
    throw new Error("couldn't parse ref " + ref);
  };

  Compare.lowercaseTree = function (tree) {
    if (tree.HEAD) tree.HEAD.target = tree.HEAD.target.toLocaleLowerCase();
    var branches = tree.branches || {};
    tree.branches = {};
    Object.keys(branches).forEach(function (name) {
      var obj = branches[name];
      obj.id = obj.id.toLocaleLowerCase();
      tree.branches[name.toLocaleLowerCase()] = obj;
    });
    return tree;
  };

  Compare.convertTreeSafe = function (tree) {
    tree = (typeof tree === 'string') ? unescapeTree(tree) : deepCopy(tree);
    this.lowercaseTree(tree);
    if (tree.originTree) tree.originTree = this.lowercaseTree(tree.originTree);
    return tree;
  };

  Compare.reduceTreeFields = function (trees) {
    var commitSave = ['parents', 'id', 'rootCommit', 'changedFiles'];
    var branchSave = ['target', 'id', 'remoteTrackingBranchID'];
    var tagSave = ['target', 'id'];
    var defaults = { remoteTrackingBranchID: null };
    trees.forEach(function (tree) {
      if (tree.tags === undefined) tree.tags = {};
    });
    var saveOnly = function (tree, key, fields, sortFields) {
      var objects = tree[key] || {};
      Object.keys(objects).forEach(function (objKey) {
        var obj = objects[objKey];
        var blank = {};
        fields.forEach(function (f) {
          if (obj[f] !== undefined) blank[f] = obj[f];
          else if (defaults[f] !== undefined) blank[f] = defaults[f];
        });
        (sortFields || []).forEach(function (f) {
          if (obj[f]) {
            obj[f] = obj[f].slice().sort();
            blank[f] = obj[f];
          }
        });
        tree[key][objKey] = blank;
      });
    };
    trees.forEach(function (tree) {
      saveOnly(tree, 'commits', commitSave, ['parents', 'changedFiles']);
      saveOnly(tree, 'branches', branchSave);
      saveOnly(tree, 'tags', tagSave);
      tree.HEAD = { target: tree.HEAD.target, id: tree.HEAD.id };
      if (tree.originTree) this.reduceTreeFields([tree.originTree]);
    }, this);
  };

  Compare.getRecurseCompare = function (treeToCompare, goalTree, options) {
    options = options || {};
    var recurseCompare = function (commitA, commitB) {
      var result = options.isEqual ? options.isEqual(commitA, commitB) : isObjEqual(commitA, commitB);
      if (!result) return false;
      var max = Math.max(commitA.parents.length, commitB.parents.length);
      for (var i = 0; i < max; i++) {
        var childA = treeToCompare.commits[commitA.parents[i]];
        var childB = goalTree.commits[commitB.parents[i]];
        result = result && recurseCompare(childA, childB);
      }
      return result;
    };
    return recurseCompare;
  };

  Compare.getRecurseCompareHashAgnostic = function (treeToCompare, goalTree) {
    var self = this;
    var strip = function (commit) {
      if (!commit) return {};
      return Object.assign({}, commit, { id: self.getBaseRef(commit.id), parents: null });
    };
    return this.getRecurseCompare(treeToCompare, goalTree, {
      isEqual: function (a, b) { return isObjEqual(strip(a), strip(b)); }
    });
  };

  Compare.compareBranchWithinTrees = function (treeToCompare, goalTree, branchName) {
    treeToCompare = this.convertTreeSafe(deepCopy(treeToCompare));
    goalTree = this.convertTreeSafe(deepCopy(goalTree));
    this.reduceTreeFields([treeToCompare, goalTree]);
    var recurse = this.getRecurseCompare(treeToCompare, goalTree);
    var a = treeToCompare.branches[branchName];
    var b = goalTree.branches[branchName];
    if (!a || !b) return false;
    return isObjEqual(a, b) &&
      recurse(treeToCompare.commits[a.target], goalTree.commits[b.target]);
  };

  Compare.compareAllBranchesWithinTrees = function (treeToCompare, goalTree) {
    treeToCompare = this.convertTreeSafe(deepCopy(treeToCompare));
    goalTree = this.convertTreeSafe(deepCopy(goalTree));
    var self = this;
    return Object.keys(goalTree.branches).every(function (branch) {
      return self.compareBranchWithinTrees(treeToCompare, goalTree, branch);
    });
  };

  Compare.compareAllTagsWithinTrees = function (treeToCompare, goalTree) {
    treeToCompare = this.convertTreeSafe(deepCopy(treeToCompare));
    goalTree = this.convertTreeSafe(deepCopy(goalTree));
    this.reduceTreeFields([treeToCompare, goalTree]);
    return isObjEqual(treeToCompare.tags, goalTree.tags);
  };

  Compare.compareAllBranchesWithinTreesAndHEAD = function (treeToCompare, goalTree) {
    treeToCompare = this.convertTreeSafe(deepCopy(treeToCompare));
    goalTree = this.convertTreeSafe(deepCopy(goalTree));
    return treeToCompare.HEAD.target === goalTree.HEAD.target &&
      this.compareAllBranchesWithinTrees(treeToCompare, goalTree) &&
      this.compareAllTagsWithinTrees(treeToCompare, goalTree);
  };

  Compare.compareAllBranchesAndEnforceBranchCleanup = function (treeToCompare, goalTree) {
    treeToCompare = this.convertTreeSafe(deepCopy(treeToCompare));
    goalTree = this.convertTreeSafe(deepCopy(goalTree));
    var all = Object.assign({}, treeToCompare.branches, goalTree.branches);
    var self = this;
    return Object.keys(all).every(function (branch) {
      return self.compareBranchWithinTrees(treeToCompare, goalTree, branch);
    });
  };

  Compare.compareBranchesWithinTreesHashAgnostic = function (treeToCompare, goalTree, branches) {
    treeToCompare = this.convertTreeSafe(deepCopy(treeToCompare));
    goalTree = this.convertTreeSafe(deepCopy(goalTree));
    this.reduceTreeFields([treeToCompare, goalTree]);
    var self = this;
    var compareBranchObjs = function (a, b) {
      if (!a || !b) return false;
      a = Object.assign({}, a); b = Object.assign({}, b);
      a.target = self.getBaseRef(a.target);
      b.target = self.getBaseRef(b.target);
      return isObjEqual(a, b);
    };
    var recurse = this.getRecurseCompareHashAgnostic(treeToCompare, goalTree);
    var result = true;
    branches.forEach(function (name) {
      var a = treeToCompare.branches[name];
      var b = goalTree.branches[name];
      result = result && compareBranchObjs(a, b) &&
        recurse(treeToCompare.commits[a.target], goalTree.commits[b.target]);
    });
    return result;
  };

  Compare.compareAllBranchesWithinTreesHashAgnostic = function (treeToCompare, goalTree) {
    treeToCompare = this.convertTreeSafe(deepCopy(treeToCompare));
    goalTree = this.convertTreeSafe(deepCopy(goalTree));
    this.reduceTreeFields([treeToCompare, goalTree]);
    var all = Object.assign({}, treeToCompare.branches, goalTree.branches);
    return this.compareBranchesWithinTreesHashAgnostic(treeToCompare, goalTree, Object.keys(all));
  };

  Compare.evalAssertsOnBranch = function (tree, branchName, asserts) {
    tree = this.convertTreeSafe(deepCopy(tree));
    if (!tree.branches[branchName]) return false;
    var queue = [tree.branches[branchName].target];
    var data = {};
    var n = 0;
    while (queue.length) {
      var ref = queue.pop();
      data[this.getBaseRef(ref)] = this.getNumHashes(ref);
      queue = queue.concat(tree.commits[ref].parents);
      n++;
    }
    data.__num_commits_upstream = n;
    var result = true;
    asserts.forEach(function (assert) {
      try {
        var fn = typeof assert === 'function' ? assert : new Function('return (' + assert + ')')();
        result = result && fn(data);
      } catch (err) { result = false; }
    });
    return result;
  };

  Compare.evalAsserts = function (tree, assertsPerBranch) {
    var self = this, result = true;
    Object.keys(assertsPerBranch).forEach(function (name) {
      result = result && self.evalAssertsOnBranch(tree, name, assertsPerBranch[name]);
    });
    return result;
  };

  Compare.compareWorkingChangesFromLevel = function (levelBlob, goalTree, treeToCompare) {
    if (!levelBlob.compareWorkingChanges) return true;
    return isObjEqual(treeToCompare.workingChanges || {}, goalTree.workingChanges || {});
  };

  Compare.dispatchShallow = function (levelBlob, goalTree, treeToCompare) {
    if (levelBlob.compareOnlyMain) {
      return this.compareBranchWithinTrees(treeToCompare, goalTree, 'main');
    }
    if (levelBlob.compareAllBranchesAndEnforceBranchCleanup) {
      return this.compareAllBranchesAndEnforceBranchCleanup(treeToCompare, goalTree);
    }
    if (levelBlob.compareOnlyBranches) {
      return this.compareAllBranchesWithinTrees(treeToCompare, goalTree);
    }
    if (levelBlob.compareAllBranchesHashAgnostic) {
      return this.compareAllBranchesWithinTreesHashAgnostic(treeToCompare, goalTree);
    }
    if (levelBlob.compareOnlyMainHashAgnostic) {
      return this.compareBranchesWithinTreesHashAgnostic(treeToCompare, goalTree, ['main']);
    }
    if (levelBlob.compareOnlyMainHashAgnosticWithAsserts) {
      return this.compareBranchesWithinTreesHashAgnostic(treeToCompare, goalTree, ['main']) &&
        this.evalAsserts(treeToCompare, levelBlob.goalAsserts);
    }
    if (levelBlob.onlyEvaluateAsserts) {
      return this.evalAsserts(treeToCompare, levelBlob.goalAsserts);
    }
    return this.compareAllBranchesWithinTreesAndHEAD(treeToCompare, goalTree);
  };

  Compare.dispatchFromLevel = function (levelBlob, treeToCompare) {
    var goal = this.convertTreeSafe(deepCopy(levelBlob.goalTreeString));
    treeToCompare = this.convertTreeSafe(deepCopy(treeToCompare));
    if (typeof goal.originTree !== typeof treeToCompare.originTree) return false;
    var shallow = this.dispatchShallow(levelBlob, goal, treeToCompare) &&
      this.compareWorkingChangesFromLevel(levelBlob, goal, treeToCompare);
    if (!shallow || !goal.originTree) return shallow;
    var originBlob = levelBlob.originCompare || levelBlob;
    return shallow &&
      this.dispatchShallow(originBlob, goal.originTree, treeToCompare.originTree) &&
      this.compareWorkingChangesFromLevel(originBlob, goal.originTree, treeToCompare.originTree);
  };

  /* ── engine ── */

  function Engine(opts) {
    opts = opts || {};
    this.localRepo = opts.localRepo || null;
    this.origin = null;
    this.clonePending = false;
    this.changesModelEngaged = false;
    this.workingChanges = {};
    this.warnings = [];
    this.lastResult = '';
    this.disabledMap = {};
    this.resetEmpty();
  }

  Engine.prototype.resetEmpty = function () {
    this.commits = {};
    this.branches = {};
    this.tags = {};
    this.HEAD = { id: 'HEAD', target: 'main' };
    this.lastHeadTarget = null;
    this.n = 0;
  };

  Engine.prototype.initUniqueID = function () { this.n = 0; };

  Engine.prototype.recalcUniqueIDCounter = function () {
    var max = -1;
    Object.keys(this.commits).forEach(function (id) {
      var m = /^C(\d+)/.exec(id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    this.n = max + 1;
  };

  Engine.prototype.hasID = function (id) {
    if (this.commits[id] || this.branches[id] || this.tags[id]) return true;
    if (this.origin && this.origin.hasID(id)) return true;
    return false;
  };

  Engine.prototype.getUniqueID = function () {
    var id = 'C' + (this.n++);
    while (this.hasID(id)) id = 'C' + (this.n++);
    return id;
  };

  Engine.prototype.crappyUnescape = function (s) {
    return String(s).replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
  };

  Engine.prototype.exportTree = function () {
    var branches = {};
    Object.keys(this.branches).forEach(function (id) {
      var b = this.branches[id];
      branches[id] = {
        id: b.id,
        target: b.target,
        remoteTrackingBranchID: b.remoteTrackingBranchID == null ? null : b.remoteTrackingBranchID
      };
    }, this);
    var commits = {};
    Object.keys(this.commits).forEach(function (id) {
      var c = this.commits[id];
      var rec = { parents: c.parents.slice(), id: c.id };
      if (c.rootCommit) rec.rootCommit = true;
      if (c.changedFiles) rec.changedFiles = c.changedFiles.slice();
      if (c.commitMessage) rec.commitMessage = c.commitMessage;
      commits[id] = rec;
    }, this);
    var tags = {};
    Object.keys(this.tags).forEach(function (id) {
      tags[id] = { id: id, target: this.tags[id].target };
    }, this);
    var out = {
      branches: branches,
      commits: commits,
      tags: tags,
      HEAD: { id: 'HEAD', target: this.HEAD.target }
    };
    if (this.origin) out.originTree = this.origin.exportTree();
    if (this.clonePending) out.clonePending = true;
    if (this.changesModelEngaged) out.changesModelEngaged = true;
    if (Object.keys(this.workingChanges).length) out.workingChanges = Object.assign({}, this.workingChanges);
    return out;
  };

  Engine.prototype.loadTree = function (tree, options) {
    options = options || {};
    tree = unescapeTree(tree);
    if (!options.preserveOrigin) this.origin = null;
    this.resetEmpty();
    Object.keys(tree.commits).forEach(function (id) {
      var c = tree.commits[id];
      this.commits[id] = {
        id: id,
        parents: (c.parents || []).slice(),
        rootCommit: !!c.rootCommit,
        changedFiles: c.changedFiles ? c.changedFiles.slice() : null,
        commitMessage: c.commitMessage || null
      };
    }, this);
    Object.keys(tree.branches).forEach(function (id) {
      var b = tree.branches[id];
      this.branches[id] = {
        id: id,
        target: b.target,
        remoteTrackingBranchID: b.remoteTrackingBranchID || null
      };
    }, this);
    Object.keys(tree.tags || {}).forEach(function (id) {
      this.tags[id] = { id: id, target: tree.tags[id].target };
    }, this);
    this.HEAD = { id: 'HEAD', target: tree.HEAD.target };
    this.workingChanges = Object.assign({}, tree.workingChanges || {});
    this.changesModelEngaged = !!tree.changesModelEngaged || Object.keys(this.workingChanges).length > 0;
    this.clonePending = !!tree.clonePending;
    this.initUniqueID();
    if (tree.originTree && !options.preserveOrigin) {
      this.origin = new Engine({ localRepo: this });
      this.origin.loadTree(tree.originTree);
    }
  };

  Engine.prototype.typeOf = function (id) {
    if (id === 'HEAD') return 'HEAD';
    if (this.commits[id]) return 'commit';
    if (this.branches[id]) return 'branch';
    if (this.tags[id]) return 'tag';
    return null;
  };

  Engine.prototype.isRemoteBranch = function (id) {
    return this.typeOf(id) === 'branch' && id.slice(0, 2) === ORIGIN;
  };

  Engine.prototype.getBaseID = function (id) {
    return id.indexOf(ORIGIN) === 0 ? id.slice(ORIGIN.length) : id;
  };

  Engine.prototype.getPrefixedID = function (id) {
    return id.indexOf(ORIGIN) === 0 ? id : ORIGIN + id;
  };

  Engine.prototype.getDetachedHead = function () {
    return this.typeOf(this.HEAD.target) !== 'branch';
  };

  Engine.prototype.getCommitFromRef = function (ref) {
    var start = typeof ref === 'string' ? this.resolveID(ref) : ref;
    var guard = 0;
    while (start && start.type !== 'commit') {
      if (start.type === 'HEAD') start = { type: this.typeOf(this.HEAD.target), id: this.HEAD.target };
      else if (start.type === 'branch') start = { type: 'commit', id: this.branches[start.id].target };
      else if (start.type === 'tag') start = { type: 'commit', id: this.tags[start.id].target };
      else break;
      if (++guard > 20) throw new GitError('cannot resolve ' + ref);
    }
    if (!start || start.type !== 'commit' || !this.commits[start.id]) {
      throw new GitError("fatal: Needed a single revision: " + ref);
    }
    return start.id;
  };

  Engine.prototype.resolveID = function (idOrTarget) {
    if (idOrTarget == null) throw new Error('resolveID null');
    if (typeof idOrTarget !== 'string') return idOrTarget;
    return this.resolveStringRef(idOrTarget);
  };

  Engine.prototype.resolveStringRef = function (ref) {
    ref = this.crappyUnescape(ref);
    var t = this.typeOf(ref);
    if (t) return { type: t, id: ref };
    if (/^c\d+'*/.test(ref) && this.commits[ref.toUpperCase()]) {
      return { type: 'commit', id: ref.toUpperCase() };
    }
    var m = /^([a-zA-Z0-9]+)(([~\^]\d*)*)$/.exec(ref);
    if (!m) throw new GitError("fatal: Not a valid object name: '" + ref + "'.");
    var startRef = m[1], relative = m[2];
    if (!this.typeOf(startRef) && /^c\d+'*/.test(startRef) && this.commits[startRef.toUpperCase()]) {
      startRef = startRef.toUpperCase();
    }
    if (!this.typeOf(startRef)) throw new GitError("fatal: Not a valid object name: '" + ref + "'.");
    var commit = this.getCommitFromRef(startRef);
    if (relative) commit = this.resolveRelativeRef(commit, relative);
    return { type: 'commit', id: commit };
  };

  Engine.prototype.resolveRelativeRef = function (commitId, relative) {
    var regex = /([~\^])(\d*)/g;
    var matches, commit = this.commits[commitId];
    while ((matches = regex.exec(relative))) {
      var num = matches[2] ? parseInt(matches[2], 10) : 1;
      var next = commit;
      if (matches[1] === '^') {
        var pid = commit.parents[num - 1];
        next = pid ? this.commits[pid] : null;
      } else {
        while (next && num--) {
          var p0 = next.parents[0];
          next = p0 ? this.commits[p0] : null;
        }
      }
      if (!next) {
        throw new GitError('fatal: ambiguous argument \'' + commitId + matches[0] + '\': unknown revision');
      }
      commit = next;
    }
    return commit.id;
  };

  Engine.prototype.getOneBeforeCommit = function (ref) {
    var start = this.resolveID(ref);
    if (start.type === 'HEAD' && !this.getDetachedHead()) {
      return { type: 'branch', id: this.HEAD.target };
    }
    return start;
  };

  Engine.prototype.setTargetLocation = function (ref, targetCommit) {
    var r = typeof ref === 'string' ? this.resolveID(ref) : ref;
    if (r.type === 'commit') return;
    r = this.getOneBeforeCommit(r.type === 'HEAD' ? 'HEAD' : r.id);
    if (r.type === 'branch') this.branches[r.id].target = targetCommit;
    else if (r.type === 'tag') this.tags[r.id].target = targetCommit;
    else if (r.type === 'HEAD') this.HEAD.target = targetCommit;
  };

  Engine.prototype.getUpstreamSet = function (ancestor) {
    var id = this.getCommitFromRef(ancestor);
    var queue = [id];
    var set = {};
    set[id] = true;
    while (queue.length) {
      var here = this.commits[queue.pop()];
      (here.parents || []).forEach(function (p) {
        if (!set[p]) { set[p] = true; queue.push(p); }
      });
    }
    return set;
  };

  Engine.prototype.isUpstreamOf = function (child, ancestor) {
    var set = this.getUpstreamSet(ancestor);
    return !!set[this.getCommitFromRef(child)];
  };

  Engine.prototype.bfsFromLocationWithSet = function (location, stopSet) {
    var result = [];
    var queue = [this.getCommitFromRef(location)];
    var seen = {};
    while (queue.length) {
      var id = queue.pop();
      if (stopSet[id] || seen[id]) continue;
      seen[id] = true;
      result.push(id);
      queue = queue.concat(this.commits[id].parents);
    }
    return result;
  };

  Engine.prototype.validateBranchName = function (name) {
    name = String(name).replace(/&#x2F;/g, '/').replace(/\s/g, '');
    if (!/^\w([.\/\-]?\w+)*$/.test(name) || name.search('o/') === 0) {
      throw new GitError("that's a unix no-no; " + name + ' is not a valid name');
    }
    if (/^[cC]\d+$/.test(name) || /[hH][eE][aA][dD]/.test(name)) {
      throw new GitError(name + ' is not a valid branch name');
    }
    if (name.length > 9) {
      name = name.slice(0, 9);
      this.warnings.push('branch name truncated to ' + name);
    }
    return name;
  };

  Engine.prototype.makeCommit = function (parents, id, options) {
    options = options || {};
    if (!id) id = this.getUniqueID();
    this.commits[id] = {
      id: id,
      parents: parents.slice(),
      rootCommit: !!options.rootCommit,
      changedFiles: options.changedFiles ? options.changedFiles.slice() : null,
      commitMessage: options.commitMessage || null
    };
    return id;
  };

  Engine.prototype.makeBranch = function (id, target) {
    if (this.branches[id] || this.commits[id] || this.tags[id]) {
      throw new Error('already have ref ' + id);
    }
    this.branches[id] = { id: id, target: target, remoteTrackingBranchID: null };
    return this.branches[id];
  };

  Engine.prototype.makeTag = function (id, target) {
    if (this.typeOf(id)) throw new GitError('tag \'' + id + '\' already exists');
    this.tags[id] = { id: id, target: target };
    return this.tags[id];
  };

  Engine.prototype.copiedChangedFiles = function (commitId) {
    var c = this.commits[commitId];
    return c && c.changedFiles ? { changedFiles: c.changedFiles.slice() } : {};
  };

  Engine.prototype.getStagedChanges = function () {
    var w = this.workingChanges, out = [];
    Object.keys(w).forEach(function (p) { if (w[p] === 'staged') out.push(p); });
    return out;
  };
  Engine.prototype.getUnstagedChanges = function () {
    var w = this.workingChanges, out = [];
    Object.keys(w).forEach(function (p) { if (w[p] === 'modified') out.push(p); });
    return out;
  };
  Engine.prototype.addFiles = function (paths) {
    var toStage = (!paths || !paths.length) ? this.getUnstagedChanges() : paths;
    toStage.forEach(function (p) {
      if (this.workingChanges[p] !== undefined) this.workingChanges[p] = 'staged';
    }, this);
  };
  Engine.prototype.restoreFiles = function (paths, options) {
    options = options || {};
    var targets = (paths && paths.length) ? paths : Object.keys(this.workingChanges);
    targets.forEach(function (p) {
      if (this.workingChanges[p] === undefined) return;
      if (options.staged) {
        if (this.workingChanges[p] === 'staged') this.workingChanges[p] = 'modified';
      } else if (this.workingChanges[p] === 'modified') {
        delete this.workingChanges[p];
      }
    }, this);
  };
  Engine.prototype.clearStagedChanges = function () {
    Object.keys(this.workingChanges).forEach(function (p) {
      if (this.workingChanges[p] === 'staged') delete this.workingChanges[p];
    }, this);
  };

  Engine.prototype.commit = function (options) {
    options = options || {};
    var changedFiles = null;
    if (this.changesModelEngaged) {
      if (options.all) this.addFiles(null);
      if (!this.getStagedChanges().length) {
        throw new CommandResult('No changes added to commit (use "git add")');
      }
      changedFiles = this.getStagedChanges().sort();
    }
    var parent = this.getCommitFromRef('HEAD');
    var id = null;
    if (options.isAmend) {
      parent = this.resolveRelativeRef(this.getCommitFromRef('HEAD'), '~1');
      id = this.rebaseAltID(this.getCommitFromRef('HEAD'));
    }
    var newId = this.makeCommit([parent], id, changedFiles ? { changedFiles: changedFiles } : {});
    if (this.getDetachedHead()) this.warnings.push('Warning: You are in a detached HEAD state.');
    this.setTargetLocation('HEAD', newId);
    if (this.changesModelEngaged) this.clearStagedChanges();
    return newId;
  };

  Engine.prototype.checkout = function (idOrTarget) {
    var target = this.resolveID(idOrTarget);
    if (target.id === 'HEAD') return;
    this.lastHeadTarget = this.HEAD.target;
    if (target.type === 'branch' && this.isRemoteBranch(target.id)) {
      this.HEAD.target = this.getCommitFromRef(target.id);
      return;
    }
    if (target.type === 'tag') {
      this.HEAD.target = this.tags[target.id].target;
      return;
    }
    if (target.type === 'branch') {
      this.HEAD.target = target.id;
      return;
    }
    if (target.type === 'commit') {
      this.HEAD.target = target.id;
      return;
    }
    throw new GitError('cannot checkout ' + idOrTarget);
  };

  Engine.prototype.branch = function (name, ref) {
    name = this.validateBranchName(name);
    if (this.typeOf(name)) throw new GitError('A branch named \'' + name + '\' already exists.');
    var target = this.getCommitFromRef(ref || 'HEAD');
    var b = this.makeBranch(name, target);
    var r = this.resolveID(ref || 'HEAD');
    if (r.type === 'branch' && this.isRemoteBranch(r.id)) {
      b.remoteTrackingBranchID = r.id;
      this.warnings.push('local branch "' + name + '" set to track remote branch "' + r.id + '"');
    }
    return b;
  };

  Engine.prototype.forceBranch = function (branchName, where) {
    branchName = this.crappyUnescape(branchName);
    if (!this.typeOf(branchName)) {
      this.branch(branchName, where);
      return;
    }
    if (this.typeOf(branchName) !== 'branch') throw new GitError(branchName + ' is not a branch');
    if (this.isRemoteBranch(branchName)) throw new GitError("can't modify a remote branch");
    this.setTargetLocation(branchName, this.getCommitFromRef(where));
  };

  Engine.prototype.deleteBranch = function (name) {
    var id = typeof name === 'string' ? name : name.id;
    if (!this.branches[id]) return;
    if (this.HEAD.target === id) this.HEAD.target = this.branches.main ? 'main' : this.getCommitFromRef('HEAD');
    delete this.branches[id];
  };

  Engine.prototype.validateAndDeleteBranch = function (name) {
    var target = this.resolveID(name);
    if (target.type !== 'branch' || target.id === 'main' || this.HEAD.target === target.id) {
      throw new GitError("can't delete branch " + name);
    }
    if (this.isRemoteBranch(target.id)) throw new GitError("can't delete remote branch");
    this.deleteBranch(target.id);
  };

  Engine.prototype.tag = function (name, ref) {
    name = this.validateBranchName(name);
    this.makeTag(name, this.getCommitFromRef(ref || 'HEAD'));
  };

  Engine.prototype.mergeCheck = function (targetSource, currentLocation) {
    return this.getCommitFromRef(targetSource) === this.getCommitFromRef(currentLocation) ||
      this.isUpstreamOf(targetSource, currentLocation);
  };

  Engine.prototype.merge = function (targetSource, options) {
    options = options || {};
    var current = 'HEAD';
    if (this.mergeCheck(targetSource, current)) {
      throw new CommandResult('Already up-to-date.');
    }
    if (this.isUpstreamOf(current, targetSource) && !options.noFF && !options.squash) {
      this.setTargetLocation(current, this.getCommitFromRef(targetSource));
      this.lastResult = 'Fast-forward';
      return;
    }
    var p1 = this.getCommitFromRef(current);
    var p2 = this.getCommitFromRef(targetSource);
    var parents = [p1];
    if (!options.squash) parents.push(p2);
    var id = this.makeCommit(parents, null, { commitMessage: 'Merge ' + targetSource });
    this.setTargetLocation(current, id);
    return id;
  };

  Engine.prototype.scrapeBaseID = function (id) {
    var m = /^C(\d+)/.exec(id);
    if (!m) throw new Error('regex failed on ' + id);
    return 'C' + m[1];
  };

  Engine.prototype.getBumpedID = function (id) {
    var m;
    if ((m = /^C(\d+)[']{0,2}$/.exec(id))) return m[0] + "'";
    if ((m = /^C(\d+)[']{3}$/.exec(id))) return m[0].slice(0, -3) + "'^4";
    if ((m = /^C(\d+)['][\^](\d+)$/.exec(id))) return 'C' + m[1] + "'^" + (Number(m[2]) + 1);
    throw new Error('could not modify the id ' + id);
  };

  Engine.prototype.rebaseAltID = function (id) {
    var newID = this.getBumpedID(id);
    while (this.commits[newID]) newID = this.getBumpedID(newID);
    return newID;
  };

  Engine.prototype.getMostRecentBumpedID = function (id) {
    var newID = id, last = id;
    while (this.commits[newID]) { last = newID; newID = this.getBumpedID(newID); }
    return last;
  };

  Engine.prototype.filterRebaseCommits = function (toRebase, stopSet, options) {
    options = options || {};
    var already = {};
    Object.keys(stopSet).forEach(function (k) { already[this.scrapeBaseID(k)] = true; }, this);
    var unique = {};
    return toRebase.filter(function (id) {
      var c = this.commits[id];
      if (c.parents.length !== 1 && !options.preserveMerges) return false;
      if (already[this.scrapeBaseID(id)]) return false;
      if (unique[id]) return false;
      unique[id] = true;
      return true;
    }, this);
  };

  Engine.prototype.rebaseFinish = function (toRebaseRough, stopSet, targetSource, currentLocation, options) {
    options = options || {};
    var orig = null;
    if (this.resolveID(currentLocation).type !== 'commit') {
      orig = this.getOneBeforeCommit(currentLocation);
    }
    var toRebase = this.filterRebaseCommits(toRebaseRough, stopSet, options);
    if (!toRebase.length) throw new GitError('No commits to rebase');
    var destCommit = this.getCommitFromRef(targetSource);
    this.checkout(destCommit);
    var base = destCommit;
    var started = false;
    toRebase.forEach(function (oldId) {
      var newId = this.rebaseAltID(oldId);
      var parents;
      if (!options.preserveMerges || !started) parents = [base];
      else {
        parents = this.commits[oldId].parents.map(function (p) {
          return this.getMostRecentBumpedID(p);
        }, this);
      }
      var extra = this.copiedChangedFiles(oldId);
      extra.commitMessage = this.commits[oldId].commitMessage;
      base = this.makeCommit(parents, newId, extra);
      started = true;
    }, this);
    if (orig) {
      this.setTargetLocation(orig, base);
      this.checkout(orig.id);
    } else {
      this.checkout(base);
    }
    return base;
  };

  Engine.prototype.rebase = function (targetSource, currentLocation, options) {
    options = options || {};
    if (this.isUpstreamOf(targetSource, currentLocation)) {
      this.lastResult = 'Current branch is up to date.';
      this.checkout(currentLocation);
      return;
    }
    if (this.isUpstreamOf(currentLocation, targetSource)) {
      this.setTargetLocation(currentLocation, this.getCommitFromRef(targetSource));
      this.lastResult = 'Fast-forward';
      this.checkout(currentLocation);
      return;
    }
    var stopSet = this.getUpstreamSet(targetSource);
    var rough = this.bfsFromLocationWithSet(currentLocation, stopSet);
    rough.reverse();
    return this.rebaseFinish(rough, stopSet, targetSource, currentLocation, options);
  };

  Engine.prototype.rebaseOnto = function (targetSource, oldSource, unit, options) {
    if (this.isUpstreamOf(unit, targetSource)) {
      this.setTargetLocation(unit, this.getCommitFromRef(targetSource));
      this.checkout(unit);
      return;
    }
    var stopSet = this.getUpstreamSet(targetSource);
    var oldSet = this.getUpstreamSet(oldSource);
    var rough = this.bfsFromLocationWithSet(unit, oldSet);
    rough.reverse();
    return this.rebaseFinish(rough, stopSet, targetSource, unit, options);
  };

  Engine.prototype.getInteractiveRebaseCommits = function (targetSource, currentLocation) {
    var stopSet = this.getUpstreamSet(targetSource);
    var rough = [];
    var queue = [this.getCommitFromRef(currentLocation)];
    var seen = {};
    while (queue.length) {
      var id = queue.pop();
      if (stopSet[id] || seen[id]) continue;
      seen[id] = true;
      rough.push(id);
      queue = queue.concat(this.commits[id].parents);
    }
    var toRebase = rough.filter(function (id) { return this.commits[id].parents.length === 1; }, this);
    if (!toRebase.length) throw new GitError('No commits to rebase');
    return toRebase;
  };

  Engine.prototype.rebaseInteractive = function (targetSource, currentLocation, options) {
    options = options || {};
    var toRebase = this.getInteractiveRebaseCommits(targetSource, currentLocation);
    var order = toRebase;
    if (options.solutionOrdering && options.solutionOrdering.length) {
      var map = {};
      toRebase.forEach(function (id) { map[id] = true; });
      order = [];
      options.solutionOrdering.forEach(function (id) {
        if (!map[id]) throw new GitError("Hey those commits don't exist in the set!");
        order.push(id);
      });
    }
    if (!order.length) throw new CommandResult('Nothing to do');
    return this.rebaseFinish(order, {}, targetSource, currentLocation);
  };

  Engine.prototype.reset = function (target) {
    if (this.getDetachedHead()) throw new GitError("Can't reset in detached HEAD");
    this.setTargetLocation('HEAD', this.getCommitFromRef(target));
  };

  Engine.prototype.revert = function (which) {
    var base = this.getCommitFromRef('HEAD');
    which.forEach(function (ref) {
      var oldId = this.getCommitFromRef(ref);
      var newId = this.rebaseAltID(oldId);
      var extra = this.copiedChangedFiles(oldId);
      extra.commitMessage = 'Revert ' + oldId;
      base = this.makeCommit([base], newId, extra);
    }, this);
    this.setTargetLocation('HEAD', base);
    return base;
  };

  Engine.prototype.cherrypick = function (commitId) {
    var id = this.rebaseAltID(commitId);
    var extra = this.copiedChangedFiles(commitId);
    extra.commitMessage = this.commits[commitId].commitMessage;
    var newId = this.makeCommit([this.getCommitFromRef('HEAD')], id, extra);
    this.setTargetLocation('HEAD', newId);
    return newId;
  };

  Engine.prototype.cherryPickMany = function (refs) {
    var set = this.getUpstreamSet('HEAD');
    var list = refs.map(function (r) {
      var id = this.getCommitFromRef(r);
      if (set[id]) throw new GitError(id + ' is already in the history');
      return id;
    }, this);
    list.forEach(function (id) { this.cherrypick(id); }, this);
  };

  Engine.prototype.describe = function (ref) {
    var start = this.getCommitFromRef(ref);
    var tagMap = {};
    Object.keys(this.tags).forEach(function (t) { tagMap[this.tags[t].target] = t; }, this);
    var queue = [start];
    var found = null;
    var away = [];
    var seen = {};
    while (queue.length) {
      var id = queue.pop();
      if (seen[id]) continue;
      seen[id] = true;
      if (tagMap[id]) { found = tagMap[id]; break; }
      away.push(id);
      queue = queue.concat(this.commits[id].parents);
    }
    if (!found) throw new GitError('Fatal: no tags found upstream');
    if (!away.length) throw new CommandResult(found);
    throw new CommandResult(found + '-' + away.length + '-g' + start);
  };

  Engine.prototype.status = function () {
    var lines = [];
    if (this.getDetachedHead()) lines.push('HEAD detached at ' + this.HEAD.target);
    else lines.push('On branch ' + this.HEAD.target);
    if (this.changesModelEngaged) {
      var staged = this.getStagedChanges();
      var unstaged = this.getUnstagedChanges();
      if (staged.length) {
        lines.push(''); lines.push('Changes to be committed:');
        staged.forEach(function (p) { lines.push('\tmodified:   ' + p); });
      }
      if (unstaged.length) {
        lines.push(''); lines.push('Changes not staged for commit:');
        unstaged.forEach(function (p) { lines.push('\tmodified:   ' + p); });
      }
      if (!staged.length && !unstaged.length) lines.push('nothing to commit, working tree clean');
      throw new CommandResult(lines.join('\n') + '\n');
    }
    lines.push('Changes to be committed:');
    lines.push('');
    lines.push('  modified: cal/OskiCostume.stl');
    throw new CommandResult(lines.map(function (l) { return '# ' + l; }).join('\n') + '\n');
  };

  Engine.prototype.log = function (refs) {
    refs = refs && refs.length ? refs : ['HEAD'];
    var set = this.getUpstreamSet(refs[0]);
    var ids = Object.keys(set);
    ids.sort(function (a, b) {
      var na = parseInt((/^C(\d+)/.exec(a) || [0, 0])[1], 10);
      var nb = parseInt((/^C(\d+)/.exec(b) || [0, 0])[1], 10);
      return nb - na;
    });
    var msg = ids.map(function (id) {
      return 'commit ' + id + '\n';
    }).join('\n');
    throw new CommandResult(msg);
  };

  Engine.prototype.printBranches = function (which) {
    var self = this;
    var names = Object.keys(this.branches).filter(function (id) {
      var remote = id.slice(0, 2) === ORIGIN;
      if (which === 'remote') return remote;
      if (which === 'all') return true;
      return !remote;
    }).sort();
    var out = names.map(function (id) {
      return (self.HEAD.target === id ? '* ' : '  ') + id;
    }).join('\n');
    throw new CommandResult(out + (out ? '\n' : ''));
  };

  Engine.prototype.pruneTree = function () {
    var keep = {};
    var self = this;
    var mark = function (id) {
      var set = self.getUpstreamSet(id);
      Object.keys(set).forEach(function (k) { keep[k] = true; });
    };
    Object.keys(this.branches).forEach(function (b) { mark(this.branches[b].target); }, this);
    Object.keys(this.tags).forEach(function (t) { mark(this.tags[t].target); }, this);
    mark('HEAD');
    var deleted = false;
    Object.keys(this.commits).forEach(function (id) {
      if (!keep[id]) { delete this.commits[id]; deleted = true; }
    }, this);
    if (deleted) this.recalcUniqueIDCounter();
    return deleted;
  };

  /* origin / remotes */

  Engine.prototype.hasOrigin = function () { return !!this.origin; };

  Engine.prototype.findCommonAncestorWithRemote = function (originTarget) {
    if (this.commits[originTarget] || this.branches[originTarget] || this.tags[originTarget]) {
      return originTarget;
    }
    var c = this.origin.commits[originTarget];
    if (!c) throw new GitError('missing origin commit ' + originTarget);
    if (c.parents.length === 1) return this.findCommonAncestorWithRemote(c.parents[0]);
    return this.findCommonAncestorWithRemote(c.parents[0]);
  };

  Engine.prototype.findCommonAncestorForRemote = function (myTarget) {
    if (this.origin.commits[myTarget] || this.origin.branches[myTarget]) return myTarget;
    var c = this.commits[myTarget];
    if (!c || !c.parents.length) throw new GitError('no common ancestor');
    return this.findCommonAncestorForRemote(c.parents[0]);
  };

  Engine.prototype.makeOriginFromLocal = function () {
    if (this.origin) throw new GitError('origin already exists!');
    var snap = this.exportTree();
    delete snap.originTree;
    this.origin = new Engine({ localRepo: this });
    this.origin.loadTree(snap);
    Object.keys(this.origin.branches).forEach(function (name) {
      if (this.branches[ORIGIN + name]) return;
      var originTarget = this.findCommonAncestorWithRemote(this.origin.branches[name].target);
      var rb = this.makeBranch(ORIGIN + name, this.getCommitFromRef(originTarget));
      if (this.branches[name]) this.branches[name].remoteTrackingBranchID = rb.id;
    }, this);
  };

  Engine.prototype.cloneFromOrigin = function () {
    if (!this.origin) throw new GitError('Nothing to clone from!');
    var originTree = this.origin.exportTree();
    var defaultBranchID = originTree.HEAD.target;
    var localTree = { branches: {}, commits: originTree.commits, tags: originTree.tags || {}, HEAD: { id: 'HEAD', target: defaultBranchID } };
    Object.keys(originTree.branches).forEach(function (name) {
      localTree.branches[ORIGIN + name] = { id: ORIGIN + name, target: originTree.branches[name].target };
    });
    localTree.branches[defaultBranchID] = {
      id: defaultBranchID,
      target: originTree.branches[defaultBranchID].target,
      remoteTrackingBranchID: ORIGIN + defaultBranchID
    };
    this.loadTree(localTree, { preserveOrigin: true });
    this.clonePending = false;
  };

  Engine.prototype.makeRemoteBranchIfNeeded = function (branchName) {
    if (this.branches[ORIGIN + branchName]) return false;
    var src;
    try { src = this.origin.resolveID(branchName); } catch (e) { return false; }
    if (src.type !== 'branch') return false;
    var target = this.origin.branches[src.id].target;
    var originTarget = this.findCommonAncestorWithRemote(target);
    this.makeBranch(ORIGIN + branchName, this.getCommitFromRef(originTarget));
    return true;
  };

  Engine.prototype.makeBranchIfNeeded = function (branchName, originName) {
    if (this.typeOf(branchName)) return false;
    var originTarget = this.findCommonAncestorWithRemote(this.origin.getCommitFromRef(originName));
    this.branch(branchName, originTarget);
    return true;
  };

  Engine.prototype.getTargetGraphDifference = function (target, source, targetBranch, sourceBranch, options) {
    options = options || {};
    var targetSet = target.getUpstreamSet(targetBranch);
    var sourceStart = source.getCommitFromRef(sourceBranch);
    var sourceTree = source.exportTree();
    if (targetSet[sourceStart]) {
      if (options.dontThrowOnNoFetch) return [];
      throw new GitError('Already up to date.');
    }
    var difference = [];
    var toExplore = [sourceTree.commits[sourceStart]];
    sourceTree.commits[sourceStart].depth = 0;
    while (toExplore.length) {
      var here = toExplore.pop();
      difference.push(here);
      (here.parents || []).forEach(function (parentID) {
        if (targetSet[parentID]) return;
        var parentJSON = sourceTree.commits[parentID];
        parentJSON.depth = here.depth + 1;
        toExplore.push(parentJSON);
      });
    }
    var uniq = [];
    var seen = {};
    difference.forEach(function (o) { if (!seen[o.id]) { seen[o.id] = true; uniq.push(o); } });
    var inOrder = [];
    var set = Object.assign({}, targetSet);
    while (uniq.length) {
      var progressed = false;
      for (var i = 0; i < uniq.length; i++) {
        var node = uniq[i];
        var ok = node.parents.every(function (p) { return set[p]; });
        if (!ok) continue;
        inOrder.push(node);
        uniq.splice(i, 1);
        set[node.id] = true;
        progressed = true;
        break;
      }
      if (!progressed) break;
    }
    return inOrder;
  };

  Engine.prototype.checkUpstreamOfSource = function (target, source, targetBranch, sourceBranch, errorMsg) {
    var upstream = source.getUpstreamSet(sourceBranch);
    var targetLocationID = target.getCommitFromRef(targetBranch);
    if (!upstream[targetLocationID]) {
      throw new GitError(errorMsg || "Your local changes would be overwritten by fetch / not a fast-forward");
    }
  };

  Engine.prototype.fetchCore = function (pairs, options) {
    options = options || {};
    if (!options.force) {
      pairs.forEach(function (pair) {
        this.checkUpstreamOfSource(this, this.origin, pair.destination, pair.source);
      }, this);
    }
    var commitsToMake = [];
    pairs.forEach(function (pair) {
      commitsToMake = commitsToMake.concat(this.getTargetGraphDifference(
        this, this.origin, pair.destination, pair.source, { dontThrowOnNoFetch: true }
      ));
    }, this);
    var seen = {};
    commitsToMake = commitsToMake.filter(function (c) {
      if (seen[c.id] || this.commits[c.id]) return false;
      seen[c.id] = true;
      return true;
    }, this);
    if (!commitsToMake.length && !options.dontThrowOnNoFetch && !options.didMakeBranch) {
      throw new GitError('Already up to date.');
    }
    commitsToMake.forEach(function (c) {
      this.makeCommit(c.parents, c.id, c.changedFiles ? { changedFiles: c.changedFiles } : {});
    }, this);
    pairs.forEach(function (pair) {
      var ours = this.resolveID(pair.destination);
      var their = this.origin.getCommitFromRef(pair.source);
      this.setTargetLocation(ours, their);
    }, this);
  };

  Engine.prototype.fetch = function (options) {
    options = options || {};
    var didMakeBranch = false;
    if (options.destination && options.source === '') {
      this.branch(options.destination, 'HEAD');
      return;
    }
    var pairs = [];
    if (options.source) {
      didMakeBranch = this.makeRemoteBranchIfNeeded(options.source) || didMakeBranch;
      var source = this.origin.resolveID(options.source);
      if (source.type === 'branch') {
        pairs.push({ destination: this.getPrefixedID(source.id), source: options.source });
      }
      if (options.destination) {
        didMakeBranch = this.makeBranchIfNeeded(options.destination, options.source) || didMakeBranch;
        pairs.push({ destination: options.destination, source: options.source });
      }
      options.didMakeBranch = didMakeBranch;
      options.dontThrowOnNoFetch = options.dontThrowOnNoFetch || didMakeBranch;
      return this.fetchCore(pairs, options);
    }
    Object.keys(this.origin.branches).forEach(function (name) {
      didMakeBranch = this.makeRemoteBranchIfNeeded(name) || didMakeBranch;
      pairs.push({ destination: ORIGIN + name, source: name });
    }, this);
    options.didMakeBranch = didMakeBranch;
    return this.fetchCore(pairs, options);
  };

  Engine.prototype.push = function (options) {
    options = options || {};
    if (options.source === '') {
      var remoteLocal = this.branches[ORIGIN + options.destination];
      var onOrigin = this.origin.branches[options.destination];
      if (!onOrigin) throw new GitError('cannot delete branch ' + options.destination + " which doesn't exist");
      if (onOrigin.id === 'main') throw new GitError('You cannot delete main branch on remote!');
      this.origin.deleteBranch(options.destination);
      if (remoteLocal) this.deleteBranch(remoteLocal.id);
      Object.keys(this.branches).forEach(function (id) {
        if (this.branches[id].remoteTrackingBranchID === ORIGIN + options.destination) {
          this.branches[id].remoteTrackingBranchID = null;
        }
      }, this);
      this.origin.pruneTree();
      return;
    }
    var sourceBranch = this.resolveID(options.source);
    if (sourceBranch.type === 'tag') throw new GitError('Tags are not allowed as sources for pushing');
    if (!this.origin.branches[options.destination] && !this.origin.commits[options.destination]) {
      this.makeBranchOnOriginAndTrack(options.destination, this.getCommitFromRef(sourceBranch));
    }
    var branchOnRemote = this.origin.resolveID(options.destination);
    var sourceLocation = this.resolveID(options.source || 'HEAD');
    if (!options.force) {
      this.checkUpstreamOfSource(this.origin, this, branchOnRemote.id, sourceLocation.id || options.source,
        'Push rejected: not a fast-forward. Use --force?');
    }
    var commitsToMake = this.getTargetGraphDifference(
      this.origin, this, branchOnRemote.id, sourceLocation.id || options.source, { dontThrowOnNoFetch: true }
    );
    commitsToMake = commitsToMake.filter(function (c) { return !this.origin.commits[c.id]; }, this);
    commitsToMake.forEach(function (c) {
      this.origin.makeCommit(c.parents, c.id, c.changedFiles ? { changedFiles: c.changedFiles } : {});
    }, this);
    var localLocationID = this.getCommitFromRef(sourceLocation.id || options.source);
    this.origin.setTargetLocation(branchOnRemote, localLocationID);
    if (!this.branches[ORIGIN + options.destination]) {
      this.makeBranch(ORIGIN + options.destination, localLocationID);
    } else {
      this.setTargetLocation(ORIGIN + options.destination, localLocationID);
    }
  };

  Engine.prototype.makeBranchOnOriginAndTrack = function (branchName, target) {
    var remoteBranch = this.branches[ORIGIN + branchName];
    if (remoteBranch) this.setTargetLocation(remoteBranch.id, target);
    else remoteBranch = this.makeBranch(ORIGIN + branchName, this.getCommitFromRef(target));
    if (this.branches[branchName]) this.branches[branchName].remoteTrackingBranchID = remoteBranch.id;
    var originTarget = this.findCommonAncestorForRemote(this.getCommitFromRef(target));
    if (!this.origin.branches[branchName]) {
      this.origin.makeBranch(branchName, this.origin.getCommitFromRef(originTarget));
    }
  };

  Engine.prototype.pull = function (options) {
    options = options || {};
    var localBranch = this.getOneBeforeCommit('HEAD');
    this.fetch({
      dontThrowOnNoFetch: true,
      force: options.force,
      source: options.source,
      destination: options.destination
    });
    var destBranch = options.destination
      ? this.resolveID(options.destination)
      : this.resolveID(this.getPrefixedID(this.origin.resolveID(options.source).id));
    if (options.isRebase) {
      if (this.isUpstreamOf(destBranch.id, localBranch.id)) {
        throw new CommandResult('Already up-to-date.');
      }
      if (this.isUpstreamOf(localBranch.id, destBranch.id)) {
        this.setTargetLocation(localBranch, this.getCommitFromRef(destBranch.id));
        this.checkout(localBranch.id);
        return;
      }
      try {
        this.rebase(destBranch.id, localBranch.id);
      } catch (err) {
        if (err instanceof GitError && /No commits to rebase/.test(err.msg)) {
          this.setTargetLocation(localBranch, this.getCommitFromRef(destBranch.id));
          this.checkout(localBranch.id);
        } else throw err;
      }
    } else {
      if (this.mergeCheck(destBranch.id, localBranch.id)) {
        throw new CommandResult('Already up-to-date.');
      }
      this.merge(destBranch.id);
    }
  };

  Engine.prototype.fakeTeamwork = function (num, branch) {
    num = num || 1;
    branch = branch || 'main';
    for (var i = 0; i < num; i++) {
      var id = this.getUniqueID();
      this.origin.checkout(branch);
      var newId = this.origin.makeCommit([this.origin.getCommitFromRef('HEAD')], id);
      this.origin.setTargetLocation('HEAD', newId);
    }
  };

  Engine.prototype.renameBranch = function (oldName, newName, force) {
    var target = this.resolveID(oldName);
    if (!target || target.type !== 'branch') throw new GitError('fatal: not a branch: ' + oldName);
    if (this.isRemoteBranch(target.id)) throw new GitError("can't rename a remote branch");
    newName = this.validateBranchName(newName);
    if (this.typeOf(newName)) {
      if (!force) throw new GitError("fatal: A branch named '" + newName + "' already exists.");
      if (this.HEAD.target === newName) throw new GitError("can't rename onto the current branch");
      this.deleteBranch(newName);
    }
    var b = this.branches[oldName];
    delete this.branches[oldName];
    b.id = newName;
    this.branches[newName] = b;
    if (this.HEAD.target === oldName) this.HEAD.target = newName;
  };

  /* ── command parser ── */

  function tokenize(line) {
    var out = [], cur = '', q = null, i, c;
    for (i = 0; i < line.length; i++) {
      c = line[i];
      if (q) {
        if (c === q) q = null;
        else cur += c;
      } else if (c === '"') {
        q = c;
      } else if (/\s/.test(c)) {
        if (cur) { out.push(cur); cur = ''; }
      } else cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  var SHORT = {
    gc: ['commit'], go: ['checkout'], gb: ['branch'], gr: ['rebase'],
    gst: ['status'], gs: ['status'], ga: ['add']
  };

  function takeFlag(args, names) {
    for (var i = 0; i < args.length; i++) {
      if (names.indexOf(args[i]) >= 0) {
        var v = args[i];
        args.splice(i, 1);
        return v;
      }
    }
    return null;
  }
  function takeOptArg(args, names) {
    for (var i = 0; i < args.length; i++) {
      if (names.indexOf(args[i]) >= 0) {
        var val = args[i + 1];
        args.splice(i, 2);
        return val == null ? '' : val;
      }
    }
    return null;
  }

  Engine.prototype.assertEnabled = function (gitVerb) {
    var key = 'git ' + gitVerb;
    if (this.disabledMap[key] || this.disabledMap[gitVerb]) {
      throw new GitError(key + ' is disabled for this level');
    }
  };

  Engine.prototype.runGit = function (line) {
    this.warnings = [];
    this.lastResult = '';
    var tokens = tokenize(line.trim());
    if (!tokens.length) return { kind: 'ok', msg: '' };
    if (SHORT[tokens[0]]) tokens = SHORT[tokens[0]].concat(tokens.slice(1));
    if (tokens[0] === 'git') tokens = tokens.slice(1);
    if (tokens[0] === 'ci') tokens[0] = 'commit';
    if (tokens[0] === 'co') tokens[0] = 'checkout';
    if (tokens[0] === 'br') tokens[0] = 'branch';
    if (tokens[0] === 'st') tokens[0] = 'status';
    var verb = tokens[0];
    var args = tokens.slice(1);
    if (!verb) return { kind: 'ok', msg: '' };
    this.assertEnabled(verb === 'cherry-pick' ? 'cherry-pick' : verb);

    var self = this;
    function impliedHead(a, n) {
      n = n || 2;
      while (a.length < n) a.push('HEAD');
      if (a.length > n) throw new GitError('too many arguments');
      return a;
    }

    switch (verb) {
      case 'commit': {
        var amend = !!takeFlag(args, ['--amend']);
        var all = !!takeFlag(args, ['-a', '--all']);
        var am = takeOptArg(args, ['-am']);
        var msg = takeOptArg(args, ['-m']);
        if (am) { all = true; msg = am; }
        if (args.length) throw new GitError('git commit takes no general args');
        this.commit({ isAmend: amend, all: all });
        return { kind: 'ok', msg: this.lastResult, warnings: this.warnings };
      }
      case 'checkout':
      case 'switch': {
        if (takeFlag(args, ['-'])) {
          if (!this.lastHeadTarget) throw new GitError('nothing to go back to');
          this.HEAD.target = this.lastHeadTarget;
          return { kind: 'ok', msg: '' };
        }
        var newB = takeOptArg(args, ['-b', '-c', '--create']);
        var forceB = takeOptArg(args, ['-B']);
        if (newB != null) {
          var pair = impliedHead([newB].concat(args), 2);
          this.branch(pair[0], pair[1]);
          this.checkout(this.validateBranchName(pair[0]));
          return { kind: 'ok', msg: '' };
        }
        if (forceB != null) {
          var pairB = impliedHead([forceB].concat(args), 2);
          this.forceBranch(pairB[0], pairB[1]);
          this.checkout(pairB[0]);
          return { kind: 'ok', msg: '' };
        }
        if (args.length !== 1) throw new GitError('checkout needs a target');
        this.checkout(args[0]);
        return { kind: 'ok', msg: '' };
      }
      case 'branch': {
        if (takeFlag(args, ['-d', '-D'])) {
          if (!args.length) throw new GitError('branch -d needs a name');
          args.forEach(function (n) { self.validateAndDeleteBranch(n); });
          return { kind: 'ok', msg: '' };
        }
        var move = takeFlag(args, ['-m', '--move']);
        var moveF = takeFlag(args, ['-M']);
        if (move || moveF) {
          if (args.length === 1) {
            if (this.getDetachedHead()) throw new GitError('HEAD does not point to a branch');
            this.renameBranch(this.HEAD.target, args[0], !!moveF);
          } else if (args.length === 2) this.renameBranch(args[0], args[1], !!moveF);
          else throw new GitError('branch -m needs 1 or 2 args');
          return { kind: 'ok', msg: '' };
        }
        var force = takeFlag(args, ['-f', '--force']);
        if (force) {
          var pf = impliedHead(args, 2);
          this.forceBranch(pf[0], pf[1]);
          return { kind: 'ok', msg: '' };
        }
        var u = takeOptArg(args, ['-u']);
        if (u != null) {
          var br = args[0] || this.getOneBeforeCommit('HEAD').id;
          this.branches[br].remoteTrackingBranchID = u;
          return { kind: 'ok', msg: '' };
        }
        if (!args.length) {
          var which = takeFlag(args, ['-a']) ? 'all' : (takeFlag(args, ['-r']) ? 'remote' : 'local');
          this.printBranches(which);
        }
        var pb = impliedHead(args, 2);
        this.branch(pb[0], pb[1]);
        return { kind: 'ok', msg: '', warnings: this.warnings };
      }
      case 'merge': {
        var noff = !!takeFlag(args, ['--no-ff']);
        var squash = !!takeFlag(args, ['--squash']);
        if (args.length !== 1) throw new GitError('merge needs a branch');
        var mid = this.merge(args[0], { noFF: noff, squash: squash });
        return { kind: 'ok', msg: this.lastResult || (mid ? 'Merge made.' : ''), warnings: this.warnings };
      }
      case 'rebase': {
        var interactive = !!takeFlag(args, ['-i']);
        var preserve = !!takeFlag(args, ['-p', '--preserve-merges']);
        var onto = takeOptArg(args, ['--onto']);
        var sol = takeOptArg(args, ['--solution-ordering']);
        var itest = takeOptArg(args, ['--interactive-test']);
        takeFlag(args, ['--aboveAll']);
        if (interactive) {
          var ia = impliedHead(args, 2);
          var order = (sol || itest || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          if (order.length) {
            this.rebaseInteractive(ia[0], ia[1], { solutionOrdering: order });
            return { kind: 'ok', msg: '' };
          }
          var commits = this.getInteractiveRebaseCommits(ia[0], ia[1]);
          return { kind: 'interactive', commits: commits, onto: ia[0], current: ia[1] };
        }
        if (onto != null) {
          var oa = [onto].concat(args);
          while (oa.length < 3) oa.push('HEAD');
          this.rebaseOnto(oa[0], oa[1], oa[2], { preserveMerges: preserve });
          return { kind: 'ok', msg: this.lastResult };
        }
        var ra = impliedHead(args, 2);
        this.rebase(ra[0], ra[1], { preserveMerges: preserve });
        return { kind: 'ok', msg: this.lastResult };
      }
      case 'reset': {
        takeFlag(args, ['--hard']);
        if (takeFlag(args, ['--soft'])) throw new GitError('git reset --soft is not supported');
        if (args.length !== 1) throw new GitError('reset needs a target');
        this.reset(args[0]);
        return { kind: 'ok', msg: '', warnings: ['Reset --hard is implied in this visualizer'] };
      }
      case 'revert': {
        if (!args.length) throw new GitError('revert needs a commit');
        this.revert(args);
        return { kind: 'ok', msg: '' };
      }
      case 'cherry-pick': {
        if (!args.length) throw new GitError('cherry-pick needs a commit');
        this.cherryPickMany(args);
        return { kind: 'ok', msg: '' };
      }
      case 'tag': {
        if (!args.length) {
          throw new CommandResult(Object.keys(this.tags).sort().join('\n'));
        }
        this.tag(args[0], args[1] || 'HEAD');
        return { kind: 'ok', msg: '' };
      }
      case 'describe': {
        if (!Object.keys(this.tags).length) throw new GitError('fatal: No tags found, cannot describe anything.');
        this.describe(args[0] || 'HEAD');
        return { kind: 'ok', msg: '' };
      }
      case 'add': {
        if (!this.changesModelEngaged) throw new CommandResult('This level has no working directory to stage.');
        var allA = !!takeFlag(args, ['-A', '-u']) || args.indexOf('.') >= 0;
        this.addFiles(allA ? null : args);
        return { kind: 'ok', msg: '' };
      }
      case 'restore': {
        if (!this.changesModelEngaged) throw new CommandResult('This level has no working directory.');
        var staged = !!takeFlag(args, ['--staged', '-S']);
        this.restoreFiles(args, { staged: staged });
        return { kind: 'ok', msg: '' };
      }
      case 'status':
        this.status();
        return { kind: 'ok', msg: '' };
      case 'log':
        this.log(args);
        return { kind: 'ok', msg: '' };
      case 'show':
        this.log(args.length ? args : ['HEAD']);
        return { kind: 'ok', msg: '' };
      case 'gc':
        this.pruneTree();
        return { kind: 'ok', msg: '' };
      case 'clone':
        if (args.length) throw new GitError('git clone takes no args here');
        if (!this.clonePending) {
          if (this.origin) throw new GitError('already cloned');
          throw new GitError('Nothing to clone from!');
        }
        this.cloneFromOrigin();
        return { kind: 'ok', msg: 'Cloned.' };
      case 'fakeCreateRemote':
        this.makeOriginFromLocal();
        return { kind: 'ok', msg: 'origin created' };
      case 'fakeTeamwork': {
        if (!this.origin) throw new GitError('origin is required');
        var br = 'main', n = 1;
        if (args.length === 1) {
          if (isNaN(parseInt(args[0], 10))) { br = args[0]; n = 1; }
          else { n = parseInt(args[0], 10); }
        } else if (args.length === 2) {
          br = args[0]; n = parseInt(args[1], 10);
        }
        this.fakeTeamwork(n, br);
        return { kind: 'ok', msg: '' };
      }
      case 'remote':
        if (!this.origin) throw new CommandResult('');
        if (takeFlag(args, ['-v'])) {
          throw new CommandResult('origin (fetch)\n  git@github.com:pcottle/foo.git\n\norigin (push)\n  git@github.com:pcottle/foo.git');
        }
        throw new CommandResult('origin');
      case 'fetch': {
        if (!this.origin) throw new GitError('origin is required');
        var forceF = !!takeFlag(args, ['--force']);
        if (args[0] === 'origin') args.shift();
        var src, dest;
        if (args[0] && args[0].indexOf(':') >= 0 && args[0].split(':').length === 2) {
          var spec = args[0];
          if (spec[0] === '+') { forceF = true; spec = spec.slice(1); }
          var parts = spec.split(':');
          src = parts[0]; dest = parts[1];
        } else if (args[0]) src = args[0];
        this.fetch({ source: src, destination: dest, force: forceF });
        return { kind: 'ok', msg: '' };
      }
      case 'pull': {
        if (!this.origin) throw new GitError('origin is required');
        var forceP = !!takeFlag(args, ['--force']);
        var isRebase = !!takeFlag(args, ['--rebase']);
        if (args[0] === 'origin') args.shift();
        var psrc, pdest;
        if (args[0] && args[0].indexOf(':') >= 0 && args[0].split(':').length === 2) {
          var ps = args[0].split(':');
          psrc = ps[0]; pdest = ps[1];
        } else if (args[0]) {
          psrc = args[0];
        } else {
          if (this.getDetachedHead()) throw new GitError('Git pull can not be executed in detached HEAD mode if no remote branch specified!');
          var cur = this.getOneBeforeCommit('HEAD');
          var track = this.branches[cur.id] && this.branches[cur.id].remoteTrackingBranchID;
          if (!track) throw new GitError(cur.id + ' is not a remote tracking branch');
          psrc = track.replace(ORIGIN, '');
        }
        try {
          this.pull({ source: psrc, destination: pdest, force: forceP, isRebase: isRebase });
        } catch (e) {
          if (e instanceof CommandResult) return { kind: 'result', msg: e.msg };
          throw e;
        }
        return { kind: 'ok', msg: this.lastResult };
      }
      case 'push': {
        if (!this.origin) throw new GitError('origin is required');
        var forcePush = !!takeFlag(args, ['--force']);
        var isDel = !!takeFlag(args, ['-d', '--delete']);
        if (args[0] === 'origin') args.shift();
        var first = args[0];
        if (isDel) {
          if (!first) throw new GitError("--delete doesn't make sense without any refs");
          first = ':' + first;
        }
        var psource, pdestination;
        if (first && first.indexOf(':') >= 0 && first.split(':').length === 2) {
          if (first[0] === '+') { forcePush = true; first = first.slice(1); }
          var rp = first.split(':');
          psource = rp[0];
          pdestination = rp[1];
        } else {
          var srcObj;
          if (first) srcObj = this.resolveID(first);
          else srcObj = this.getOneBeforeCommit('HEAD');
          psource = srcObj.id;
          if (srcObj.type === 'branch' && this.branches[srcObj.id] && this.branches[srcObj.id].remoteTrackingBranchID) {
            pdestination = this.getBaseID(this.branches[srcObj.id].remoteTrackingBranchID);
          } else {
            pdestination = this.validateBranchName(psource);
          }
        }
        this.push({ source: psource, destination: pdestination, force: forcePush });
        return { kind: 'ok', msg: '' };
      }
      default:
        throw new GitError("git: '" + verb + "' is not a git command.");
    }
  };

  Engine.prototype.runLine = function (line) {
    try {
      return this.runGit(line);
    } catch (e) {
      if (e instanceof CommandResult) return { kind: 'result', msg: e.msg, warnings: this.warnings };
      if (e instanceof GitError) return { kind: 'error', msg: e.msg, warnings: this.warnings };
      throw e;
    }
  };

  Engine.prototype.runLines = function (text) {
    var parts = String(text).split(/;|\n/);
    var last = { kind: 'ok', msg: '' };
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].trim();
      if (!s) continue;
      last = this.runLine(s);
      if (last.kind === 'error') return last;
      if (last.kind === 'interactive') return last;
    }
    return last;
  };

  root.LGB = {
    Engine: Engine,
    GitError: GitError,
    CommandResult: CommandResult,
    Compare: Compare,
    unescapeTree: unescapeTree,
    ORIGIN: ORIGIN
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

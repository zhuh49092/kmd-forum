// 全局变量
let plants = [];
let newPlants = [];
let currentPlantId = 0;
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX, startY;
let latestPubDate = '';
let pollingInterval = null;
let localNewPlantIds = new Set();
let activityHintShown = { active: false, visitors: false };
let reaccessFeedbackCompleted = false;
let reaccessUsedCustomViewport = false;
const newFlowerSwayPlantIds = new Set();
const KEY_SEEN_POST_TIME_BASELINE = '1970-01-01T00:00:00.000Z';
let cachedKeyLastSeenPostTime = null;
let currentModalPlant = null;
let gardenAuthor = '';

// 性能优化：O(1) 查找索引
let plantRecordIdMap = new Map(); // recordId -> plant
let plantIdMap = new Map(); // id -> plant
let commentCacheByRid = new Map(); // rid -> [comments]
let cachedPlantsArray = null; // 缓存 plants 数组快照，减少遍历

// 读取保存的用户名
function getGardenAuthor() {
    try {
        gardenAuthor = localStorage.getItem('garden_author') || '';
    } catch (e) {
        console.error('读取 localStorage 失败:', e);
        gardenAuthor = '';
    }
    return gardenAuthor;
}

// 保存用户名
function saveGardenAuthor(name) {
    try {
        localStorage.setItem('garden_author', name);
        gardenAuthor = name;
    } catch (e) {
        console.error('保存 localStorage 失败:', e);
    }
}

// 生成唯一ID
function generateUniqueId() {
    const timestamp = new Date().getTime();
    const randomPart = Math.floor(Math.random() * 10000);
    return `${timestamp}-${randomPart}`;
}

// 获取配置值（带默认值）
function getConfig(path, defaultValue) {
    const cfg = window.GARDEN_CONFIG || {};
    const keys = path.split('.');
    let obj = cfg;
    for (let i = 0; i < keys.length; i++) {
        if (obj === undefined || obj === null) return defaultValue;
        obj = obj[keys[i]];
    }
    return obj !== undefined ? obj : defaultValue;
}

// 便捷获取器
function getOverlapDistance() { return getConfig('interactionConfig.overlapMinDistance', 120); }
function getOverlapAttempts() { return getConfig('interactionConfig.overlapMaxAttempts', 30); }
function getInitialScale() { return getConfig('interactionConfig.initialScale', 1.5); }
function getBubbleDuration() { return getConfig('interactionConfig.bubbleMessageDuration', 2000); }
function getActivityDuration() { return getConfig('interactionConfig.activityMessageDuration', 10000); }
function getSubmitCloseDelay() { return getConfig('interactionConfig.submitSuccessCloseDelay', 1000); }
function getCommentRefreshDelay() { return getConfig('interactionConfig.commentSuccessRefreshDelay', 800); }
function getArrowHideDelay() { return getConfig('interactionConfig.plantArrowHideDelay', 5000); }
function getDragClickDelay() { return getConfig('interactionConfig.dragClickDelay', 500); }
function getDragJustDraggedDelay() { return getConfig('interactionConfig.dragJustDraggedDelay', 200); }
function getActivityTimeout() { return getConfig('activityConfig.activeUsersTimeout', 180000); }
function getMinVisitors() { return getConfig('activityConfig.minTodayVisitorsToShow', 5); }

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

function chance(p) {
    return Math.random() < p;
}

function withPlantImageFallback($img, cfg) {
    const fallback = (cfg.plantImages && cfg.plantImages[0]) ? cfg.plantImages[0] : '';
    $img.on('error', function() {
        if (this.dataset.fallbackApplied === '1' || !fallback) return;
        this.dataset.fallbackApplied = '1';
        this.src = fallback;
    });
    return $img;
}

// 筛选数据
function filterData(data, _id) {
    if (commentCacheByRid.has(_id)) {
        return commentCacheByRid.get(_id);
    }
    let filteredData = data.filter(item => item.pid === _id);
    const sortedData = filteredData.sort((a, b) => {
        let valueA = a.Cdate;
        let valueB = b.Cdate;
        if (typeof valueA === 'string') {
            valueA = valueA.toLowerCase();
            valueB = valueB.toLowerCase();
        }
        return valueA < valueB ? 1 : -1;
    });
    commentCacheByRid.set(_id, sortedData);
    return sortedData;
}

// 构建评论缓存（一次性预处理所有评论）
function buildCommentCache(comments) {
    commentCacheByRid.clear();
    if (!comments) return;
    comments.forEach(function(c) {
        const rid = c.pid || c.rid;
        if (!rid) return;
        if (!commentCacheByRid.has(rid)) {
            commentCacheByRid.set(rid, []);
        }
        commentCacheByRid.get(rid).push(c);
    });
    // 对每个 rid 的评论排序
    commentCacheByRid.forEach(function(list) {
        list.sort((a, b) => {
            const ta = a.Cdate || a.cdate || '';
            const tb = b.Cdate || b.cdate || '';
            return ta < tb ? 1 : -1;
        });
    });
}

// 添加植物到索引
function registerPlant(plant) {
    plants.push(plant);
    if (plant.recordId) plantRecordIdMap.set(plant.recordId, plant);
    plantIdMap.set(plant.id, plant);
    cachedPlantsArray = null;
}

// 按 recordId 查找植物 O(1)
function findPlantByRecordId(recordId) {
    return plantRecordIdMap.get(recordId);
}

// 按 id 查找植物 O(1)
function findPlantById(id) {
    return plantIdMap.get(id);
}

// 获取最新日期
function getLatestDateFromDateArray(dates) {
    if (!dates || dates.length === 0) return '';
    let latest = new Date(0);
    dates.forEach(function(d) {
        const date = new Date(d);
        if (date > latest) latest = date;
    });
    return latest.toISOString();
}

// 根据记录创建花草对象
function createPlantFromRecord(record) {
    const cfg = window.GARDEN_CONFIG;
    // 统一使用小写字段名（兼容 GS 返回的数据）
    const flowerName = record.flowername || record.flowerName || '';
    const picture = record.picture || '';
    const content = record.content || '';
    const name = record.name || record.gname || '';
    const x = record.x !== undefined ? record.x : undefined;
    const y = record.y !== undefined ? record.y : undefined;
    const likes = record.likes || 0;
    const comments = record.comments || 0;
    const id = record.id || record.rid || '';
    const pubdate = record.pubdate || record.pubDate || record.PubDate || '';
    
    let imageIndex = 0;
    if (flowerName) {
        const targetPath = 'plant/' + flowerName + '.png';
        for (let i = 0; i < cfg.plantImages.length; i++) {
            if (cfg.plantImages[i] === targetPath) {
                imageIndex = i;
                break;
            }
        }
        if (imageIndex === 0 && cfg.plantImages[0] !== targetPath) {
            for (let i = 0; i < cfg.plantImages.length; i++) {
                if (cfg.plantImages[i].includes(flowerName)) {
                    imageIndex = i;
                    break;
                }
            }
        }
    }
    
    return {
        id: currentPlantId++,
        recordId: id,
        imageIndex: imageIndex,
        image: cfg.plantImages[imageIndex],
        userImage: picture,
        userContent: content,
        userName: name,
        keyId: String(record.key_id ?? record.keyId ?? '').trim(),
        x: x !== undefined ? x : rand(200, cfg.worldSize.width - 200),
        y: y !== undefined ? y : rand(200, cfg.worldSize.height - 200),
        likes: likes,
        commentCount: comments,
        comments: [],
        isNew: false,
        createdTime: pubdate || new Date().toISOString()
    };
}

// 合并新增记录到页面
function mergeNewRecords(newRecords) {
    if (!newRecords || newRecords.length === 0) return;
    let addedCount = 0;
    const newlyAddedPlants = [];

    newRecords.forEach(function(record) {
        const recordId = record.id || record.rid;

        if (localNewPlantIds.has(recordId)) {
            return;
        }

        if (plantRecordIdMap.has(recordId)) {
            return;
        }

        const plant = createPlantFromRecord(record);

        const recordComments = commentCacheByRid.get(plant.recordId);
        if (recordComments && recordComments.length > 0) {
            recordComments.forEach(function(comment) {
                plant.comments.push({
                    user: comment.name || '匿名用户',
                    text: comment.comment || '',
                    cdate: comment.Cdate || new Date().toISOString()
                });
            });
        }

        registerPlant(plant);
        renderPlant(plant);
        addedCount++;
        newlyAddedPlants.push(plant);
    });

    if (addedCount > 0) {
        showActivityMessage('新しい花が咲きました！');
        startNewFlowerSwayForPlants(newlyAddedPlants);
        const keyId = getUrlKeyId();
        if (keyId) {
            persistEventSeenPostTimeFromPlants(keyId, newlyAddedPlants);
        }
    }
}

// 合并新增评论到页面
function mergeNewComments(newComments) {
    if (!newComments || newComments.length === 0) return;
    
    newComments.forEach(function(comment) {
        const recordId = comment.rid || comment.pid;
        const plant = findPlantByRecordId(recordId);
        
        if (plant) {
            const exists = plant.comments.some(function(c) {
                return c.text === comment.comment && c.user === comment.name;
            });
            
            if (!exists) {
                plant.comments.push({
                    user: comment.name || '匿名用户',
                    text: comment.comment || '',
                    cdate: comment.Cdate || new Date().toISOString()
                });
                plant.commentCount = (plant.commentCount || 0) + 1;
            }
        }
    });
}

// 轮询检查新数据
function startPolling() {
    if (!latestPubDate) {
        console.warn('没有最新日期，不启动轮询');
        return;
    }
    
    pollingInterval = setInterval(async function() {
        try {
            const promises = [];
            
            const recordsUrl = new URL(SCRIPT_URL);
            recordsUrl.searchParams.append('action', 'getlatestrecords');
            recordsUrl.searchParams.append('since', latestPubDate);
            promises.push(fetch(recordsUrl).then(r => r.ok ? r.json() : null));
            
            const commentsUrl = new URL(SCRIPT_URL);
            commentsUrl.searchParams.append('action', 'getlatestcomments');
            commentsUrl.searchParams.append('since', latestPubDate);
            promises.push(fetch(commentsUrl).then(r => r.ok ? r.json() : null));
            
            const activityUrl = new URL(SCRIPT_URL);
            activityUrl.searchParams.append('action', 'getactivity');
            promises.push(fetch(activityUrl).then(r => r.ok ? r.json() : null));
            
            const results = await Promise.all(promises);
            const recordsResult = results[0];
            const commentsResult = results[1];
            const activityResult = results[2];
            
            if (recordsResult && recordsResult.success && recordsResult.data && recordsResult.data.length > 0) {
                mergeNewRecords(recordsResult.data);
                const dates = recordsResult.data.map(function(r) {
                    return r.pubdate || r.PubDate;
                });
                const newLatest = getLatestDateFromDateArray(dates);
                if (newLatest > latestPubDate) {
                    latestPubDate = newLatest;
                }
            }
            
            if (commentsResult && commentsResult.success && commentsResult.data && commentsResult.data.length > 0) {
                mergeNewComments(commentsResult.data);
                const dates = commentsResult.data.map(function(c) {
                    return c.Cdate || c.cdate;
                });
                const newLatest = getLatestDateFromDateArray(dates);
                if (newLatest > latestPubDate) {
                    latestPubDate = newLatest;
                }
            }
            
            if (activityResult && activityResult.success && activityResult.data) {
                const { activeUsers, todayVisitors } = activityResult.data;
                if (activeUsers > 0 && !activityHintShown.active) {
                    showActivityMessage('今、庭で誰かが遊んでいます！');
                    activityHintShown.active = true;
                    const timeout = getActivityTimeout();
                    if (timeout > 0) {
                        setTimeout(function() { activityHintShown.active = false; }, timeout);
                    }
                }
                if (todayVisitors > getMinVisitors() && !activityHintShown.visitors) {
                    showActivityMessage('今日はすでに ' + todayVisitors + ' 人が庭に来ています！');
                    activityHintShown.visitors = true;
                }
            }
        } catch (error) {
            console.error('轮询新数据失败:', error);
        }
    }, 10000);
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

function getTimePeriod() {
    const now = new Date();
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    const periods = window.GARDEN_CONFIG.timePeriods;

    if (totalMinutes >= periods.morning.start && totalMinutes < periods.morning.end) {
        return 'morning';
    } else if (totalMinutes >= periods.day.start && totalMinutes < periods.day.end) {
        return 'day';
    } else if (totalMinutes >= periods.evening.start && totalMinutes < periods.evening.end) {
        return 'evening';
    } else {
        return 'night';
    }
}

function updateTimeOverlay() {
    const cfg = window.GARDEN_CONFIG.timePeriods;
    if (!cfg.enabled) {
        $('#time-overlay').css({
            'background-color': 'transparent',
            'opacity': 0
        });
        return;
    }
    const period = getTimePeriod();
    const config = cfg[period];
    $('#time-overlay').css({
        'background-color': config.color,
        'opacity': config.opacity
    });
}

function updateTimeDisplay() {
    const now = new Date();
    const periodNames = { morning: '朝', day: '昼', evening: '夕方', night: '夜' };
    $('#current-time').text(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    $('#time-period').text(' · ' + periodNames[getTimePeriod()]);
}

function isNight() {
    return getTimePeriod() === 'night';
}

function isDay() {
    const period = getTimePeriod();
    return period === 'day' || period === 'morning' || period === 'evening';
}

function createPlant() {
    const cfg = window.GARDEN_CONFIG;
    
    // 检测两个植物是否重叠
    function isOverlapping(x1, y1, x2, y2, minDistance) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return dx * dx + dy * dy < minDistance * minDistance;
    }

    // 寻找屏幕可视范围内的空白位置
    function findEmptySpot() {
        const minDistSq = getOverlapDistance() * getOverlapDistance();
        const padding = 100;
        
        const viewportWidth = $(window).width();
        const viewportHeight = $(window).height();
        
        const worldLeft = -translateX / scale;
        const worldTop = -translateY / scale;
        const worldRight = worldLeft + viewportWidth / scale;
        const worldBottom = worldTop + viewportHeight / scale;
        
        const cachedPlants = cachedPlantsArray || (cachedPlantsArray = plants.slice());
        
        for (let attempt = 0; attempt < getOverlapAttempts(); attempt++) {
            const testX = rand(worldLeft + padding, worldRight - padding);
            const testY = rand(worldTop + padding, worldBottom - padding);
            
            let hasOverlap = false;
            for (let i = 0; i < cachedPlants.length; i++) {
                const p = cachedPlants[i];
                const dx = testX - p.x;
                const dy = testY - p.y;
                if (dx * dx + dy * dy < minDistSq) {
                    hasOverlap = true;
                    break;
                }
            }
            
            if (!hasOverlap) {
                return { x: testX, y: testY };
            }
        }
        
        return null;
    }
    
    // 尝试寻找空位
    const spot = findEmptySpot();
    
    if (!spot) {
        showBubbleMessage('庭がいっぱいです！空いている場所を探してみてください。', 'warning');
        return;
    }
    
    // 创建临时花草对象（待投稿）
    const maxIndex = Math.max(0, cfg.plantImages.length - 1);
    const imageIndex = randInt(0, maxIndex);
    const timestamp = Date.now();
    
    pendingPlant = {
        id: currentPlantId++,
        recordId: 'new-' + timestamp,
        imageIndex: imageIndex,
        image: cfg.plantImages[imageIndex] || cfg.plantImages[0] || '',
        userImage: '',
        userContent: '',
        userName: '',
        x: spot.x,
        y: spot.y,
        likes: 0,
        comments: [],
        isNew: true,
        isMovable: true,
        createdTime: new Date().toISOString()
    };
    
    // 显示种植蒙板
    showPlantingOverlay();
}

// 种植蒙板相关变量
let pendingPlant = null;
let $plantOverlay = null;
let $plantOverlayImg = null;
let $movePlantHint = null;

// ===== 新手引导 Onboarding（仅 UI，不影响业务逻辑）=====
const ONBOARDING_DONE_KEY = 'jr_onboardingDone';
let onboardingStepIndex = 0;
let onboardingActive = false;
let $onboardingOverlay = null;
let $onboardingTip = null;
// onboarding 箭头已禁用（按需求移除）

function isOnboardingDone() {
    try {
        return localStorage.getItem(ONBOARDING_DONE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function setOnboardingDone() {
    try {
        localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch (e) {}
}

function ensureOnboardingUI() {
    if ($onboardingOverlay) return;
    $onboardingOverlay = $('<div id="onboarding-overlay"></div>');
    $onboardingTip = $('<div class="onboarding-tip"></div>');
    $onboardingOverlay.append($onboardingTip);
    $('body').append($onboardingOverlay);
}

function clearOnboardingUI() {
    if ($onboardingOverlay) {
        $onboardingOverlay.remove();
        $onboardingOverlay = null;
        $onboardingTip = null;
    }
    $('#plant-btn').removeClass('onboarding-plant-btn-glow');
}

function hideOnboarding() {
    onboardingActive = false;
    document.removeEventListener('click', handleOnboardingAdvance, true);
    document.removeEventListener('touchend', handleOnboardingAdvance, true);
    clearOnboardingUI();
    // 已按需求禁用 onboardingDone 逻辑：每次进入都显示
}

function setTipPositionTopLeft() {
    if (!$onboardingTip) return;
    $onboardingTip.css({
        position: 'fixed',
        top: '88px',
        left: '18px',
        right: 'auto',
        bottom: 'auto',
        transform: 'none'
    });
}

function setTipPositionNearPlantBtn() {
    if (!$onboardingTip) return;
    const btn = document.getElementById('plant-btn');
    if (!btn) {
        setTipPositionTopLeft();
        return;
    }
    const r = btn.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 120, r.bottom + 14);
    const right = Math.max(18, window.innerWidth - r.right);
    $onboardingTip.css({
        position: 'fixed',
        top: top + 'px',
        right: right + 'px',
        left: 'auto',
        bottom: 'auto',
        transform: 'none'
    });
}

function renderOnboardingStep() {
    ensureOnboardingUI();
    if (!$onboardingTip) return;

    // 默认不阻挡拖拽/缩放
    $('#plant-btn').removeClass('onboarding-plant-btn-glow');

    if (onboardingStepIndex === 0) {
        $onboardingTip.html('指で庭を探検しよう。<br>ピンチで拡大・縮小できます。');
        setTipPositionTopLeft();
    } else if (onboardingStepIndex === 1) {
        $onboardingTip.html('花を押すと、<br>みんなのお話が見れます');
        setTipPositionTopLeft();
    } else if (onboardingStepIndex === 2) {
        $onboardingTip.html('ボタンから花を植えます');
        setTipPositionNearPlantBtn();
        $('#plant-btn').addClass('onboarding-plant-btn-glow');
    } else {
        hideOnboarding();
    }
}

function handleOnboardingAdvance(e) {
    if (!onboardingActive) return;
    // 仅用于 onboarding 切换；不希望触发底层点击（开弹窗/种花/点赞等）
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    onboardingStepIndex++;
    if (onboardingStepIndex >= 3) {
        hideOnboarding();
        return;
    }
    renderOnboardingStep();
}

function initOnboarding() {
    // 已按需求禁用 onboardingDone：每次刷新/进入都显示
    onboardingActive = true;
    onboardingStepIndex = 0;
    renderOnboardingStep();
    document.addEventListener('click', handleOnboardingAdvance, true);
    document.addEventListener('touchend', handleOnboardingAdvance, true);
}

function hideMovePlantHint() {
    if ($movePlantHint) {
        $movePlantHint.remove();
        $movePlantHint = null;
    }
}

function showMovePlantHint() {
    hideMovePlantHint();
    $movePlantHint = $('<div class="move-plant-hint">花を押して好きな位置に移動しましょう</div>');
    $('body').append($movePlantHint);
}

// 显示种植蒙板
function showPlantingOverlay() {
    const cfg = window.GARDEN_CONFIG;
    
    // 创建蒙板
    $plantOverlay = $('<div id="plant-overlay"></div>');
    $plantOverlay.css({
        'position': 'fixed',
        'top': '0',
        'left': '0',
        'width': '100%',
        'height': '100%',
        'background-color': 'rgba(0, 0, 0, 0.6)',
        'z-index': '8000',
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'flex-direction': 'column'
    });
    
    // 创建容器
    const $container = $('<div class="plant-overlay-container"></div>');
    $container.css({
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'gap': '40px'
    });
    
    // 左箭头
    const $leftArrow = $('<div class="plant-overlay-arrow"><i class="fas fa-chevron-left"></i></div>');
    $leftArrow.css({
        'width': '50px',
        'height': '50px',
        'background-color': 'rgba(255, 255, 255, 0.3)',
        'border-radius': '50%',
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'cursor': 'pointer',
        'color': 'white',
        'font-size': '24px',
        'transition': 'background-color 0.2s'
    }).on('mouseenter', function() {
        $(this).css('background-color', 'rgba(255, 255, 255, 0.5)');
    }).on('mouseleave', function() {
        $(this).css('background-color', 'rgba(255, 255, 255, 0.3)');
    }).on('click', function() {
        pendingPlant.imageIndex = (pendingPlant.imageIndex - 1 + cfg.plantImages.length) % cfg.plantImages.length;
        pendingPlant.image = cfg.plantImages[pendingPlant.imageIndex];
        $plantOverlayImg.attr('src', pendingPlant.image);
    });
    
    // 中间花草（点击投稿）
    $plantOverlayImg = $('<img src="' + pendingPlant.image + '" alt="plant-preview">');
    withPlantImageFallback($plantOverlayImg, cfg);
    $plantOverlayImg.css({
        'width': '200px',
        'height': '200px',
        'object-fit': 'contain',
        'cursor': 'pointer',
        'transition': 'transform 0.2s',
        'animation': 'plantBreathe 1.5s ease-in-out infinite'
    }).on('mouseenter', function() {
        $(this).css('transform', 'scale(1.1)');
    }).on('mouseleave', function() {
        $(this).css('transform', 'scale(1)');
    }).on('click', function() {
        // 打开投稿弹窗
        openSubmitModal();
    });
    
    // 右箭头
    const $rightArrow = $('<div class="plant-overlay-arrow"><i class="fas fa-chevron-right"></i></div>');
    $rightArrow.css({
        'width': '50px',
        'height': '50px',
        'background-color': 'rgba(255, 255, 255, 0.3)',
        'border-radius': '50%',
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'cursor': 'pointer',
        'color': 'white',
        'font-size': '24px',
        'transition': 'background-color 0.2s'
    }).on('mouseenter', function() {
        $(this).css('background-color', 'rgba(255, 255, 255, 0.5)');
    }).on('mouseleave', function() {
        $(this).css('background-color', 'rgba(255, 255, 255, 0.3)');
    }).on('click', function() {
        pendingPlant.imageIndex = (pendingPlant.imageIndex + 1) % cfg.plantImages.length;
        pendingPlant.image = cfg.plantImages[pendingPlant.imageIndex];
        $plantOverlayImg.attr('src', pendingPlant.image);
    });
    
    // 关闭按钮
    const $closeBtn = $('<div class="plant-overlay-close"><i class="fas fa-times"></i></div>');
    $closeBtn.css({
        'position': 'absolute',
        'top': '20px',
        'left': '20px',
        'right': 'auto',
        'width': '40px',
        'height': '40px',
        'background-color': 'rgba(255, 255, 255, 0.3)',
        'border-radius': '50%',
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'cursor': 'pointer',
        'color': 'white',
        'font-size': '18px',
        'transition': 'background-color 0.2s'
    }).on('mouseenter', function() {
        $(this).css('background-color', 'rgba(255, 255, 255, 0.5)');
    }).on('mouseleave', function() {
        $(this).css('background-color', 'rgba(255, 255, 255, 0.3)');
    }).on('click', function() {
        cancelPlant();
    });
    
    // 顶部提示文字
    const $topPrompt = $('<div class="plant-overlay-title"></div>');
    $topPrompt.css({
        'margin-bottom': '22px',
        'padding': '0 24px',
        'color': 'white',
        'font-size': 'clamp(22px, 5vw, 30px)',
        'font-weight': '700',
        'line-height': '1.4',
        'text-align': 'center',
        'text-shadow': '0 2px 10px rgba(0, 0, 0, 0.35)'
    }).text('どんな花を植えたい？');

    // 底部提示文字
    const $hint = $('<div class="plant-overlay-hint"></div>');
    $hint.css({
        'margin-top': '30px',
        'color': 'white',
        'font-size': '14px',
        'font-weight': '600',
        'padding': '0 24px',
        'text-align': 'center'
    }).text('タップで植える｜左右で花を選ぶ');
    
    $container.append($leftArrow, $plantOverlayImg, $rightArrow);
    $plantOverlay.append($closeBtn, $topPrompt, $container, $hint);
    $('body').append($plantOverlay);
    $('body').css('overflow', 'hidden');
}

// 隐藏种植蒙板
function hidePlantingOverlay() {
    if ($plantOverlay) {
        $plantOverlay.fadeOut(300, function() {
            $plantOverlay.remove();
            $plantOverlay = null;
            $plantOverlayImg = null;
            $('body').css('overflow', 'auto');
        });
    }
}

// 取消种植
function cancelPlant() {
    // 隐藏蒙板
    hidePlantingOverlay();
    hideMovePlantHint();
    
    // 清除待种植状态
    pendingPlant = null;
    
    showBubbleMessage('植えるのをキャンセルしました。', 'info');
}

// 完成种植（投稿完成后调用）
function finalizePlant() {
    if (!pendingPlant) return;
    
    // 隐藏蒙板
    hidePlantingOverlay();
    
    // 注册花草
    registerPlant(pendingPlant);
    cachedPlantsArray = null;
    renderPlant(pendingPlant, false); // 不显示箭头
    showMovePlantHint();
    
    // 清除待种植状态
    pendingPlant = null;
}

// 打开投稿弹窗
function openSubmitModal() {
    if (!pendingPlant) return;
    const author = getGardenAuthor();
    if (!author) {
        showAuthorForm(function() {
            showSubmitForm(pendingPlant);
        });
    } else {
        showSubmitForm(pendingPlant);
    }
}

function renderPlant(plant, showArrows) {
    const cfg = window.GARDEN_CONFIG;
    const $plant = $('<div class="plant" data-id="' + plant.id + '"></div>');
    $plant.css({ left: plant.x + 'px', top: plant.y + 'px' });

    const $img = $('<img src="' + plant.image + '" alt="plant">');
    withPlantImageFallback($img, cfg);
    
    // 只有已投稿的花草才显示用户内容
    let $userContent;
    if (!plant.isNew) {
        // 优先显示图片，只有没有图片时才显示文字
        if (plant.userImage && plant.userImage.trim() !== '' && plant.userImage.startsWith('http')) {
            // 显示图片
            $userContent = $('<div class="plant-user-image"><img src="' + plant.userImage + '" alt="user"></div>');
        } else if (plant.userContent && plant.userContent.trim() !== '') {
            // 显示文字内容
            $userContent = $('<div class="plant-user-text">' + plant.userContent + '</div>');
        }
    }

    $plant.append($img);
    if ($userContent) $plant.append($userContent);
    
    // 显示评论数徽章（如果有评论）
    if (!plant.isNew && plant.commentCount > 0) {
        const $commentBadge = $('<div class="comment-badge">' + plant.commentCount + '</div>');
        $plant.append($commentBadge);
    }

    // 显示点赞数徽章（花下方中间）
    if (!plant.isNew && plant.likes > 0) {
        const $likesBadge = $('<div class="likes-badge" data-count="' + plant.likes + '"></div>');
        $plant.append($likesBadge);
    }

    // 当前会话刚投稿的花草显示呼吸动画，便于用户找到并移动
    if (isSessionFreshPlant(plant)) {
        $plant.addClass('plant-new');
    }

    $('#plants-layer').append($plant);
    
    // 只有本地新增的花草可以拖动
    if (!plant.isNew && plant.isMovable) {
        makePlantDraggable($plant, plant);
    }
    
    $plant.on('click', function(e) {
        // 如果标记为重叠，不弹窗
        if ($(this).data('isOverlapping')) {
            return;
        }
        
        // 已有花草使用原来的 dragging/justDragged 机制
        if ($(this).hasClass('dragging') || $(this).data('justDragged')) {
            return;
        }
        
        openModal(plant, e.clientX, e.clientY);
    });
}

function makePlantDraggable($element, plant) {
    let isDraggingPlant = false;
    let hasDragged = false;
    let dragOffsetX, dragOffsetY;
    let originalX, originalY;
    let clickAllowed = false;

    function startPlantDrag(clientX, clientY) {
        isDraggingPlant = true;
        hasDragged = false;
        clickAllowed = false;
        $element.addClass('dragging');
        const worldPos = screenToWorld(clientX, clientY);
        dragOffsetX = worldPos.x - plant.x;
        dragOffsetY = worldPos.y - plant.y;
        originalX = plant.x;
        originalY = plant.y;
    }

    function movePlantDrag(clientX, clientY) {
        if (isDraggingPlant) {
            hasDragged = true;
            const worldPos = screenToWorld(clientX, clientY);
            plant.x = worldPos.x - dragOffsetX;
            plant.y = worldPos.y - dragOffsetY;
            $element.css({ left: plant.x + 'px', top: plant.y + 'px' });
        }
    }

    function endPlantDrag() {
        if (isDraggingPlant) {
            isDraggingPlant = false;
            $element.removeClass('dragging');
            
            if (hasDragged) {
                hideMovePlantHint();
                const overlapping = checkOverlap(plant);
                
                if (overlapping) {
                    showBubbleMessage('ここにはすでに花があります。空いている場所を探してください。', 'warning');
                    plant.x = originalX;
                    plant.y = originalY;
                    $element.css({ left: plant.x + 'px', top: plant.y + 'px' });
                    $element.data('isOverlapping', true);
                    clickAllowed = false;
                } else {
                    $element.removeData('isOverlapping');
                    clickAllowed = true;
                    setTimeout(function() { clickAllowed = false; }, getDragClickDelay());
                    
                    // 可移动花草拖动结束后自动保存位置（debounce）
                    if (plant.isMovable) {
                        scheduleAutoSavePosition(plant);
                    }
                }
            } else {
                clickAllowed = true;
                setTimeout(function() { clickAllowed = false; }, getDragJustDraggedDelay());
            }
        }
    }

    // 长按显示箭头（仅新花草）
    let longPressTimer = null;
    const LONG_PRESS_DURATION = 400; // 长按时长（毫秒）

    function startLongPress() {
        if (!plant.isNew) return;
        const $leftArrow = $element.find('.plant-arrow-left');
        const $rightArrow = $element.find('.plant-arrow-right');
        if (!$leftArrow.length) return;
        // 如果箭头已显示，清除计时器
        if ($leftArrow.is(':visible')) {
            clearTimeout(longPressTimer);
            return;
        }
        longPressTimer = setTimeout(function() {
            $leftArrow.fadeIn(300);
            $rightArrow.fadeIn(300);
            // 5秒后再次隐藏
            setTimeout(function() {
                $leftArrow.fadeOut(300);
                $rightArrow.fadeOut(300);
            }, getArrowHideDelay());
        }, LONG_PRESS_DURATION);
    }

    function cancelLongPress() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    // 鼠标事件
    $element.on('mousedown', function(e) {
        e.stopPropagation();
        startLongPress();
        startPlantDrag(e.clientX, e.clientY);
    });

    $element.on('mouseup', function(e) {
        cancelLongPress();
    });

    $(document).on('mousemove', function(e) {
        movePlantDrag(e.clientX, e.clientY);
    });

    $(document).on('mouseup', function() {
        endPlantDrag();
        cancelLongPress();
    });

    // 触摸事件（使用原生事件避免 jQuery 兼容问题）
    const plantEl = $element[0];
    
    plantEl.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
            e.stopPropagation();
            const touch = e.touches[0];
            startLongPress();
            startPlantDrag(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    plantEl.addEventListener('touchmove', function(e) {
        if (e.touches.length === 1 && isDraggingPlant) {
            e.preventDefault();
            const touch = e.touches[0];
            movePlantDrag(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    plantEl.addEventListener('touchend', function() {
        endPlantDrag();
        cancelLongPress();
    });

    // 存储 clickAllowed 检查函数
    $element.data('isPlantDraggable', true);
    $element[0]._plantDragState = {
        getClickAllowed: function() { return clickAllowed; },
        setClickAllowed: function(val) { clickAllowed = val; }
    };
}

// 拖动结束后自动保存位置（debounce，仅保存最后一次位置）
const positionSaveDebounceTimers = new Map();
const POSITION_SAVE_DEBOUNCE_MS = 700;

function scheduleAutoSavePosition(plant) {
    if (!plant || !plant.recordId) return;

    $('.save-position-btn').remove();

    const existingTimer = positionSaveDebounceTimers.get(plant.id);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(async function() {
        positionSaveDebounceTimers.delete(plant.id);
        try {
            await postData('updatePosition', {
                rid: plant.recordId,
                x: plant.x,
                y: plant.y
            });
            console.log('位置を自動保存しました', {
                rid: plant.recordId,
                x: plant.x,
                y: plant.y
            });
        } catch (err) {
            console.warn('位置の自動保存に失敗しました:', err);
        }
    }, POSITION_SAVE_DEBOUNCE_MS);

    positionSaveDebounceTimers.set(plant.id, timer);
}

// 检查是否与现有花草重叠
function checkOverlap(plant, minDistance) {
    const dist = minDistance || getOverlapDistance() / 2;
    const distSq = dist * dist;
    const cachedPlants = cachedPlantsArray || (cachedPlantsArray = plants.slice());
    
    for (let i = 0; i < cachedPlants.length; i++) {
        const other = cachedPlants[i];
        if (other.id === plant.id) continue;
        
        const dx = plant.x - other.x;
        const dy = plant.y - other.y;
        
        if (dx * dx + dy * dy < distSq) {
            return other;
        }
    }
    
    return null;
}

// 显示冒泡提示
function showBubbleMessage(message, type) {
    const $bubble = $('<div class="bubble-message">' + message + '</div>');
    $bubble.css({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        padding: '15px 25px',
        borderRadius: '25px',
        fontSize: '16px',
        fontWeight: 'bold',
        zIndex: 9999,
        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
        animation: 'bubbleFloat 2s ease-in-out forwards'
    });
    
    if (type === 'warning') {
        $bubble.css({
            background: 'linear-gradient(135deg, #ff6b6b, #ff8e53)',
            color: 'white'
        });
    } else if (type === 'success') {
        $bubble.css({
            background: 'linear-gradient(135deg, #4CAF50, #8BC34A)',
            color: 'white'
        });
    } else {
        $bubble.css({
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white'
        });
    }
    
    $('body').append($bubble);
    
    setTimeout(function() {
        $bubble.fadeOut(300, function() {
            $(this).remove();
        });
    }, getBubbleDuration());
}

// 显示活跃度提示（从顶部滑入，停留10秒后滑出）
function showActivityMessage(message) {
    const $msg = $('<div class="activity-message">' + message + '</div>');
    $msg.css({
        position: 'fixed',
        top: '-80px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 24px',
        borderRadius: '25px',
        fontSize: '15px',
        fontWeight: 'bold',
        color: 'white',
        background: 'linear-gradient(135deg, #ff9a56, #ff6b6b)',
        zIndex: 10000,
        boxShadow: '0 4px 15px rgba(255, 107, 107, 0.4)',
        whiteSpace: 'normal',
        maxWidth: '80vw',
        textAlign: 'center'
    });
    $('body').append($msg);
    
    // 滑入动画
    $msg.css('animation', 'slideDown 0.5s ease forwards');
    
    // 10 秒后滑出消失
    setTimeout(function() {
        $msg.css('animation', 'slideUp 0.5s ease forwards');
        setTimeout(function() { $msg.remove(); }, 500);
    }, getActivityDuration());
}

function getUrlKeyId() {
    if (typeof getEntryContext === 'function') {
        return String(getEntryContext().keyId || '').trim();
    }
    return String(new URLSearchParams(window.location.search).get('key') || '').trim();
}

function isSessionFreshPlant(plant) {
    if (!plant) {
        return false;
    }
    const recordId = plant.recordId || '';
    return recordId !== '' && localNewPlantIds.has(recordId);
}

function showReaccessMessage() {
    const $msg = $('<div class="activity-message reaccess-message">新しい花が咲きました！</div>');
    $msg.css({
        position: 'fixed',
        top: '-80px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 24px',
        borderRadius: '25px',
        fontSize: '15px',
        fontWeight: 'bold',
        color: 'white',
        background: 'linear-gradient(135deg, #4ade80, #16a34a)',
        zIndex: 10000,
        boxShadow: '0 4px 15px rgba(22, 163, 74, 0.35)',
        whiteSpace: 'nowrap',
        maxWidth: '80vw',
        textAlign: 'center'
    });
    $('body').append($msg);
    $msg.css('animation', 'slideDown 0.5s ease forwards');
    setTimeout(function() {
        $msg.css('animation', 'slideUp 0.5s ease forwards');
        setTimeout(function() { $msg.remove(); }, 500);
    }, 5000);
}

function getStoredLastSeenPostTime(keyStateData) {
    if (!keyStateData) {
        return null;
    }
    return keyStateData.last_seen_post_time || keyStateData.last_visit || null;
}

function parseValidCreatedTime(value) {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
}

function getMaxLoadedPlantCreatedTimeIso() {
    let maxMs = -Infinity;
    let maxIso = null;

    plants.forEach(function(plant) {
        const parsed = parseValidCreatedTime(plant.createdTime);
        if (parsed && parsed.getTime() > maxMs) {
            maxMs = parsed.getTime();
            maxIso = parsed.toISOString();
        }
    });

    return maxIso || KEY_SEEN_POST_TIME_BASELINE;
}

function maxValidCreatedTimeIso(candidateIsos) {
    let maxMs = -Infinity;
    let maxIso = null;

    candidateIsos.forEach(function(iso) {
        if (!iso) {
            return;
        }
        const parsed = parseValidCreatedTime(iso);
        if (parsed && parsed.getTime() > maxMs) {
            maxMs = parsed.getTime();
            maxIso = parsed.toISOString();
        }
    });

    return maxIso;
}

function getMaxPlantListCreatedTimeIso(plantList) {
    if (!plantList || plantList.length === 0) {
        return null;
    }

    return maxValidCreatedTimeIso(plantList.map(function(plant) {
        return plant.createdTime;
    }));
}

async function writeMonotonicKeySeenPostTime(keyId, eventIso) {
    if (!keyId || !eventIso || typeof window.updateKeyState !== 'function') {
        return;
    }

    const candidates = [eventIso];
    if (cachedKeyLastSeenPostTime) {
        candidates.push(cachedKeyLastSeenPostTime);
    }

    const nextSeenPostTime = maxValidCreatedTimeIso(candidates);
    if (!nextSeenPostTime) {
        return;
    }

    try {
        cachedKeyLastSeenPostTime = nextSeenPostTime;
        await window.updateKeyState(keyId, nextSeenPostTime);
    } catch (error) {
        console.warn('key seen post time update failed:', error);
    }
}

async function persistFirstVisitKeyBaseline(keyId) {
    await writeMonotonicKeySeenPostTime(keyId, getMaxLoadedPlantCreatedTimeIso());
}

async function persistEventSeenPostTimeFromPlants(keyId, plantList) {
    const eventIso = getMaxPlantListCreatedTimeIso(plantList);
    if (!eventIso) {
        return;
    }
    await writeMonotonicKeySeenPostTime(keyId, eventIso);
}

function getPlantsNewerThan(lastSeenPostTimeIso) {
    const since = parseValidCreatedTime(lastSeenPostTimeIso);
    if (!since) {
        return [];
    }

    return plants.filter(function(plant) {
        const created = parseValidCreatedTime(plant.createdTime);
        return created && created.getTime() > since.getTime();
    });
}

function pickNewestPlant(plantList) {
    if (!plantList || plantList.length === 0) {
        return null;
    }

    return plantList.reduce(function(newest, plant) {
        const newestTime = new Date(newest.createdTime).getTime();
        const plantTime = new Date(plant.createdTime).getTime();
        if (isNaN(newestTime) || (!isNaN(plantTime) && plantTime > newestTime)) {
            return plant;
        }
        return newest;
    });
}

function getViewportClampBounds() {
    const cfg = window.GARDEN_CONFIG;
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const worldScaledWidth = cfg.worldSize.width * scale;
    const worldScaledHeight = cfg.worldSize.height * scale;

    return {
        minTranslateX: containerWidth - worldScaledWidth,
        minTranslateY: containerHeight - worldScaledHeight,
        containerWidth: containerWidth,
        containerHeight: containerHeight
    };
}

function clampViewportTranslate(nextTranslateX, nextTranslateY, bounds) {
    return {
        translateX: Math.max(bounds.minTranslateX, Math.min(0, nextTranslateX)),
        translateY: Math.max(bounds.minTranslateY, Math.min(0, nextTranslateY))
    };
}

function computeViewportForPlant(plant, bounds) {
    const nextTranslateX = bounds.containerWidth / 2 - plant.x * scale;
    const nextTranslateY = bounds.containerHeight / 2 - plant.y * scale;
    return clampViewportTranslate(nextTranslateX, nextTranslateY, bounds);
}

function isPlantComfortablyVisible(plant, nextTranslateX, nextTranslateY, bounds) {
    const margin = 40;
    const screenX = plant.x * scale + nextTranslateX;
    const screenY = plant.y * scale + nextTranslateY;

    return screenX >= margin &&
        screenX <= bounds.containerWidth - margin &&
        screenY >= margin &&
        screenY <= bounds.containerHeight - margin;
}

function panViewportToPlant(plant) {
    if (!plant) return;

    const bounds = getViewportClampBounds();
    const clamped = computeViewportForPlant(plant, bounds);
    translateX = clamped.translateX;
    translateY = clamped.translateY;
    updateTransform();
}

function panViewportToPlantSmooth(plant) {
    return new Promise(function(resolve) {
        if (!plant) {
            resolve();
            return;
        }

        const $world = $('#garden-world');
        $world.css('transition', 'transform 0.85s ease-out');
        panViewportToPlant(plant);

        setTimeout(function() {
            $world.css('transition', '');
            resolve();
        }, 900);
    });
}

function getPlantFlowerImg(plant) {
    if (!plant || plant.id === undefined) {
        return $();
    }
    return $('.plant[data-id="' + plant.id + '"] > img').first();
}

function getPlantElement(plant) {
    if (!plant || plant.id === undefined) {
        return $();
    }
    return $('.plant[data-id="' + plant.id + '"]').first();
}

function startNewFlowerSwayForPlants(plantList) {
    if (!plantList || plantList.length === 0) {
        return;
    }

    plantList.forEach(function(plant) {
        if (!plant || plant.id === undefined) {
            return;
        }
        newFlowerSwayPlantIds.add(plant.id);
        getPlantElement(plant).addClass('plant-reaccess-active');
        getPlantFlowerImg(plant).addClass('plant-reaccess-sway');
    });
}

function stopNewFlowerSwayForPlant(plant) {
    if (!plant || plant.id === undefined) {
        return;
    }
    newFlowerSwayPlantIds.delete(plant.id);
    getPlantElement(plant).removeClass('plant-reaccess-active');
    getPlantFlowerImg(plant).removeClass('plant-reaccess-sway');
}

async function handleKeyReaccessFeedback() {
    const keyId = getUrlKeyId();
    if (!keyId) {
        reaccessFeedbackCompleted = true;
        return null;
    }

    let keyStateResult = { success: false, data: null };
    if (typeof window.getKeyState === 'function') {
        try {
            keyStateResult = await window.getKeyState(keyId);
        } catch (error) {
            console.warn('key state read failed:', error);
        }
    }

    if (!keyStateResult.success) {
        reaccessFeedbackCompleted = true;
        return null;
    }

    const lastSeenPostTime = getStoredLastSeenPostTime(keyStateResult.data);
    if (lastSeenPostTime) {
        cachedKeyLastSeenPostTime = lastSeenPostTime;
    }

    if (!lastSeenPostTime) {
        await persistFirstVisitKeyBaseline(keyId);
        reaccessFeedbackCompleted = true;
        return null;
    }

    const newPlants = getPlantsNewerThan(lastSeenPostTime);
    if (newPlants.length === 0) {
        reaccessFeedbackCompleted = true;
        return null;
    }

    const targetPlant = pickNewestPlant(newPlants);
    if (!targetPlant) {
        reaccessFeedbackCompleted = true;
        return null;
    }

    reaccessUsedCustomViewport = true;
    panViewportToPlant(targetPlant);
    await persistEventSeenPostTimeFromPlants(keyId, newPlants);
    reaccessFeedbackCompleted = true;
    return newPlants;
}

// 启动活跃度检查
function startActivityCheck() {
    // 首次进入页面记录访问来源
    if (typeof window.ViewCard === 'function') {
        const params = new URLSearchParams(window.location.search);
        const entryType = params.get('entry') || 'home';
        window.ViewCard(0, entryType);
    }
    // 活跃度检查已合并到轮询中，不再需要独立定时器
}

// 停止活跃度检查（已合并到轮询，保留此函数兼容旧代码）
function stopActivityCheck() {
    // 活跃度检查已合并到轮询中
}

function screenToWorld(screenX, screenY) {
    return { x: (screenX - translateX) / scale, y: (screenY - translateY) / scale };
}

function updateTransform() {
    const worldWidth = window.GARDEN_CONFIG.worldSize.width;
    const worldHeight = window.GARDEN_CONFIG.worldSize.height;
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    const minScale = Math.max(containerWidth / worldWidth, containerHeight / worldHeight);
    scale = Math.max(scale, minScale);

    const worldScaledWidth = worldWidth * scale;
    const worldScaledHeight = worldHeight * scale;

    translateX = Math.max(containerWidth - worldScaledWidth, Math.min(translateX, 0));
    translateY = Math.max(containerHeight - worldScaledHeight, Math.min(translateY, 0));

    $('#garden-world').css('transform', 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')');
}

function openModal(plant, mouseX, mouseY) {
    currentModalPlant = plant;

    if (newFlowerSwayPlantIds.has(plant.id)) {
        stopNewFlowerSwayForPlant(plant);
    }
    
    const isNewPlant = plant.isNew;
    const title = isNewPlant ? '新种植花草' : '花の記録';
    const submitter = plant.userName || '匿名';
    const submitDate = plant.createdTime ? new Date(plant.createdTime).toLocaleDateString('zh-CN') : '';
    
    // 设置标题
    $('#modal-title span').text(title);
    
    let contentHtml = '<div class="space-y-3">';
    
    if (!isNewPlant) {
        // 记录浏览数据（同一稿件在同一会话中只记录一次）
        if (typeof window.ViewCard === 'function' && plant.recordId) {
            const viewedKey = 'viewed_' + plant.recordId;
            if (!sessionStorage.getItem(viewedKey)) {
                sessionStorage.setItem(viewedKey, '1');
                window.ViewCard(plant.recordId);
            }
        }

        // 第一行：投稿人和日期
        contentHtml += '<div class="flex justify-between items-center text-xs text-gray-500">';
        contentHtml += '<div class="flex items-center space-x-1.5">';
        contentHtml += '<i class="fas fa-user text-green-600 text-xs"></i>';
        contentHtml += '<span class="text-gray-700 font-medium">' + submitter + '</span>';
        contentHtml += '</div>';
        contentHtml += '<div class="flex items-center space-x-1.5">';
        contentHtml += '<i class="far fa-calendar-alt text-xs"></i>';
        contentHtml += '<span>' + submitDate + '</span>';
        contentHtml += '</div>';
        contentHtml += '</div>';
        
        // 第二行：图片和文字区
        contentHtml += '<div class="space-y-2.5">';
        if (plant.userImage && plant.userImage.trim() !== '' && plant.userImage.startsWith('http')) {
            contentHtml += '<div class="flex justify-center">';
            contentHtml += '<img src="' + plant.userImage + '" alt="画像" class="max-w-full max-h-80 rounded-lg shadow-sm object-contain">';
            contentHtml += '</div>';
        }
        if (plant.userContent && plant.userContent.trim() !== '') {
            contentHtml += '<div class="bg-gray-50 rounded-lg p-3 border-l-3 border-green-600">';
            contentHtml += '<p class="text-gray-700 leading-relaxed text-sm whitespace-pre-wrap">' + plant.userContent + '</p>';
            contentHtml += '</div>';
        }
        if (!plant.userImage && !plant.userContent) {
            contentHtml += '<div class="text-center py-10 text-gray-400">';
            contentHtml += '<i class="fas fa-image text-3xl mb-2"></i>';
            contentHtml += '<p class="text-sm">まだ内容がありません</p>';
            contentHtml += '</div>';
        }
        contentHtml += '</div>';
        
        // 第三行：评论区
        contentHtml += '<div class="border-t pt-3">';
        contentHtml += '<div class="flex justify-between items-center mb-2.5">';
        contentHtml += '<h4 class="text-xs font-medium text-gray-700 flex items-center">';
        contentHtml += '<i class="fas fa-comments mr-1.5 text-green-600"></i>';
        contentHtml += 'コメント';
        contentHtml += '<span class="ml-1 text-xs text-gray-400">(' + (plant.commentCount || 0) + ')</span>';
        contentHtml += '</h4>';
        contentHtml += '<div class="flex items-center cursor-pointer text-red-500 hover:text-red-600 transition-colors" id="like-btn">';
        contentHtml += '<i class="fas fa-thumbs-up mr-1"></i>';
        contentHtml += '<span class="text-xs">(' + (plant.likes || 0) + ')</span>';
        contentHtml += '</div>';
        contentHtml += '</div>';
        
        contentHtml += '<div class="space-y-2 max-h-60 overflow-y-auto mb-3 pr-2 custom-scrollbar">';
        if (plant.comments.length === 0) {
            contentHtml += '<div class="text-center py-6 text-gray-400 bg-gray-50 rounded-lg">';
            contentHtml += '<i class="far fa-comment-dots text-2xl mb-2"></i>';
            contentHtml += '<p class="text-xs">まだコメントはありません。最初に書いてみよう！</p>';
            contentHtml += '</div>';
        } else {
            plant.comments.forEach(function(c, index) {
                const commentDate = c.cdate ? new Date(c.cdate).toLocaleDateString('zh-CN') : '';
                contentHtml += '<div class="bg-gray-50 rounded-lg p-2.5 hover:bg-green-50 transition-colors duration-200">';
                contentHtml += '<div class="flex justify-between items-start mb-1">';
                contentHtml += '<span class="font-medium text-green-600 text-xs">' + (c.user || '匿名') + '</span>';
                if (commentDate) {
                    contentHtml += '<span class="text-xs text-gray-400">' + commentDate + '</span>';
                }
                contentHtml += '</div>';
                contentHtml += '<p class="text-gray-700 text-xs leading-relaxed">' + (c.text || c.comment || '') + '</p>';
                contentHtml += '</div>';
            });
        }
        contentHtml += '</div>';
        
        // 评论输入框
        contentHtml += '<div class="flex space-x-2">';
        contentHtml += '<textarea id="comment-input" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 transition-all duration-200 resize-none" placeholder="コメントを書いてみよう…" rows="2"></textarea>';
        contentHtml += '<button id="submit-comment" class="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-green-700 transition-colors duration-200 shadow-sm flex items-center space-x-1">';
        contentHtml += '<i class="fas fa-comment"></i>';
        contentHtml += '<span>送信</span>';
        contentHtml += '</button>';
        contentHtml += '</div>';
        contentHtml += '<div id="modal-result" class="mt-3 p-3 rounded-lg border hidden"></div>';
        contentHtml += '</div>';
    } else {
        // 新种植花草
        contentHtml += '<div class="text-center py-10">';
        contentHtml += '<div class="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">';
        contentHtml += '<i class="fas fa-seedling text-2xl text-green-600"></i>';
        contentHtml += '</div>';
        contentHtml += '<p class="text-gray-600 text-sm mb-2">新しく植えた花です。まだ投稿がありません。</p>';
        contentHtml += '<p class="text-gray-400 text-xs">閉じてからもう一度タップすると投稿できます。</p>';
        contentHtml += '</div>';
    }
    
    contentHtml += '</div>';
    
    // 设置内容
    $('#modal-content .modal-body').html(contentHtml);
    
    // 重新绑定评论提交事件
    $('#submit-comment').off('click').on('click', function() {
        addComment();
    });

    // 绑定点赞事件
    $('#like-btn').off('click').on('click', async function() {
        const $btn = $(this);
        const result = await window.PostLike(currentModalPlant.recordId);
        if (result.success) {
            currentModalPlant.likes = (currentModalPlant.likes || 0) + 1;
            $btn.find('span').text('(' + currentModalPlant.likes + ')');
            $btn.addClass('text-green-600');
            
            // 更新草地上的点赞徽章
            let $likesBadge = $('.plant[data-id="' + currentModalPlant.id + '"] .likes-badge');
            if ($likesBadge.length === 0) {
                // 如果没有徽章，创建一个新的
                $likesBadge = $('<div class="likes-badge"></div>');
                $('.plant[data-id="' + currentModalPlant.id + '"]').append($likesBadge);
            }
            $likesBadge.attr('data-count', currentModalPlant.likes);
        }
    });
    
    // 显示弹窗
    $('#modal-overlay').css({ 'display': 'flex', 'z-index': '9000' });
    
    // 强制重绘并添加动画
    setTimeout(function() {
        $('#modal-content').css('opacity', '1').css('transform', 'scale(1)');
    }, 50);
}

// 设置弹窗位置（已改用CSS flex居中，此函数保留但不再手动定位）
function positionModal(mouseX, mouseY) {
    // 弹窗现在通过CSS flexbox在#modal-overlay中居中显示
}

function closeModal() {
    $('#modal-content').css('opacity', '0').css('transform', 'scale(0.95)');
    setTimeout(function() {
        $('#modal-overlay').css('display', 'none');
        // 重置样式
        $('#modal-content').css('opacity', '').css('transform', '');
    }, 300);
}

// 用户名输入弹窗
function showAuthorForm(callback) {
    const contentHtml = '<div class="space-y-4">' +
        '<div>' +
        '<label class="block text-sm font-medium text-gray-700 mb-2">ニックネーム</label>' +
        '<input id="author-input" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200" placeholder="はじめての投稿ですね。表示名を入力してください。">' +
        '</div>' +
        '</div>';

    $('#modal-title span').text('ニックネームを入力');
    $('#modal-content .modal-body').html(contentHtml + '<div class="mt-4 flex justify-center"><button id="author-submit" class="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700">確定</button></div>');

    $('#modal-overlay').css({ 'display': 'flex', 'z-index': '9000' });
    $('#modal-content').css('opacity', '1').css('transform', 'scale(1)');

    $('#author-submit').off('click').on('click', function() {
        const name = $('#author-input').val().trim();
        if (!name) {
            showBubbleMessage('表示名は必須です。', 'warning');
            return;
        }
        saveGardenAuthor(name);
        // 延迟一点再打开投稿表单，确保弹窗内容已更新
        setTimeout(function() {
            if (callback) callback();
        }, 100);
    });
}

// 投稿表单弹窗（写真優先 / 文字は副次モード）
function showSubmitForm(plant, mode) {
    let selectedImage = null;
    const initialMode = mode || 'photo';

    function bindImageUpload() {
        $('#image-file').off('click').on('click', function(e) {
            e.stopPropagation();
        });

        $('#image-upload-area').off('click').on('click', function(e) {
            e.stopPropagation();
            $('#image-file')[0].click();
        });

        $('#image-file').off('change').on('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.match('image.*')) {
                showBubbleMessage('画像ファイルを選択してください', 'warning');
                return;
            }
            selectedImage = file;
            const reader = new FileReader();
            reader.onload = function(ev) {
                $('#image-preview').attr('src', ev.target.result).removeClass('hidden');
                $('#image-placeholder').hide();
                $('#image-upload-area').addClass('has-preview');
            };
            reader.readAsDataURL(file);
        });

        if (selectedImage) {
            const reader = new FileReader();
            reader.onload = function(ev) {
                $('#image-preview').attr('src', ev.target.result).removeClass('hidden');
                $('#image-placeholder').hide();
                $('#image-upload-area').addClass('has-preview');
            };
            reader.readAsDataURL(selectedImage);
        }
    }

    function bindSubmitButton(onSubmit) {
        $('#submit-btn').off('click').on('click', async function() {
            $('#submit-btn').prop('disabled', true);
            try {
                await onSubmit();
            } catch (err) {
                $('#submit-btn').prop('disabled', false);
            }
        });
    }

    function showModalShell() {
        $('#modal-title span').text('花を植える');
        $('#modal-overlay').css({ 'display': 'flex', 'z-index': '9000' });
        $('#modal-content').css('opacity', '1').css('transform', 'scale(1)');
    }

    function renderPhotoMode() {
        const contentHtml =
            '<div class="submit-form submit-mode-photo">' +
                '<p class="submit-photo-prompt">言葉はいらない。<br>イベントで見つけた1枚、<br>花の肥料になる。</p>' +
                '<label class="submit-photo-label">写真\u3000（人物の顔が写らないもの）</label>' +
                '<div id="image-upload-area" class="submit-photo-action">' +
                    '<div id="image-placeholder" class="submit-photo-placeholder">' +
                        '<i class="fas fa-cloud-upload-alt"></i>' +
                        '<span class="submit-photo-action-text">クリックで選択／撮る</span>' +
                    '</div>' +
                    '<img id="image-preview" class="submit-photo-preview hidden" alt="preview">' +
                    '<input type="file" id="image-file" accept="image/*" class="hidden">' +
                '</div>' +
                '<div class="submit-actions">' +
                    '<button type="button" id="submit-btn" class="submit-primary-btn">植える</button>' +
                    '<button type="button" id="switch-to-text" class="submit-mode-switch">写真がない？文字でもいいぞ。</button>' +
                '</div>' +
            '</div>';

        $('#modal-content .modal-body').html(contentHtml);
        bindImageUpload();
        bindSubmitButton(async function() {
            if (!selectedImage) {
                showBubbleMessage('写真を選んでから植えてね', 'warning');
                $('#submit-btn').prop('disabled', false);
                return;
            }
            await submitData(selectedImage, '', plant);
        });
        $('#switch-to-text').off('click').on('click', function() {
            renderTextMode();
        });
        showModalShell();
    }

    function renderTextMode() {
        const contentHtml =
            '<div class="submit-form submit-mode-text">' +
                '<label class="submit-text-label" for="submit-message">話したいこと</label>' +
                '<textarea id="submit-message" class="submit-textarea" placeholder="今日の天気がいいね……" rows="5"></textarea>' +
                '<div class="submit-actions">' +
                    '<button type="button" id="submit-btn" class="submit-primary-btn">植える</button>' +
                    '<button type="button" id="switch-to-photo" class="submit-mode-switch">写真に戻る</button>' +
                '</div>' +
            '</div>';

        $('#modal-content .modal-body').html(contentHtml);
        bindSubmitButton(async function() {
            const message = $('#submit-message').val().trim();
            if (!message) {
                showBubbleMessage('メッセージを書いてから植えてね', 'warning');
                $('#submit-btn').prop('disabled', false);
                return;
            }
            await submitData(null, message, plant);
        });
        $('#switch-to-photo').off('click').on('click', function() {
            renderPhotoMode();
        });
        showModalShell();
    }

    if (initialMode === 'text') {
        renderTextMode();
    } else {
        renderPhotoMode();
    }
}

// 提交投稿数据
async function submitData(imageFile, message, plant) {
    $.showLoading();
    try {
        let pictureUrl = '';
        if (imageFile) {
            const base64Data = await compressImageToBase64(imageFile);
            const uploadResult = await uploadImageToGitHub(message, base64Data, imageFile.name, { keepLoading: true });
            if (!uploadResult.success) {
                showBubbleMessage('アップロードに失敗しました: ' + uploadResult.message, 'warning');
                $('#submit-btn').prop('disabled', false);
                return;
            }
            pictureUrl = uploadResult.picurl;
        }

        const flowerNameValue = plant && plant.imageIndex !== undefined && window.GARDEN_CONFIG.plantImages[plant.imageIndex] 
            ? window.GARDEN_CONFIG.plantImages[plant.imageIndex]
                .replace('plant/', '')
                .replace('.png', '')
            : '不明';
            
        const params = new URLSearchParams(window.location.search);
const entryType = params.get('entry') || 'garden';
const keyId = params.get('key') || '';

const submitDataObj = {
    rid: generateUniqueId(),
    gname: gardenAuthor,
    content: message,
    picture: pictureUrl,
    entry_type: entryType,
    key_id: keyId,
    likes: 0,
    comments: 0,
    x: plant ? Math.round(plant.x) : 0,
    y: plant ? Math.round(plant.y) : 0,
    flowerName: flowerNameValue
};
        
        console.log('投稿数据:', submitDataObj);

        await postData('save', submitDataObj, { keepLoading: true });
        
        // 更新植物状态
        plant.userImage = pictureUrl;
        plant.userContent = message;
        plant.userName = gardenAuthor;
        plant.keyId = getUrlKeyId();
        plant.isNew = false;
        plant.recordId = submitDataObj.rid;
        
        // 记录已提交的本地花草ID，防止轮询时重复添加
        localNewPlantIds.add(submitDataObj.rid);

        let serverPubDateIso = null;
        if (typeof window.getRecordPubDateWithRetry === 'function') {
            try {
                serverPubDateIso = await window.getRecordPubDateWithRetry(submitDataObj.rid);
            } catch (error) {
                console.warn('getrecordpubdate retry failed:', error);
            }
        }
        const parsedServerPubDate = parseValidCreatedTime(serverPubDateIso);
        if (parsedServerPubDate) {
            plant.createdTime = parsedServerPubDate.toISOString();
        }

        const urlKeyId = getUrlKeyId();
        if (urlKeyId && plant.createdTime) {
            await writeMonotonicKeySeenPostTime(urlKeyId, plant.createdTime);
        }
        
        // 检查是否是待种植的花草（蒙板模式）
        if (pendingPlant && pendingPlant.id === plant.id) {
            closeModal();
            finalizePlant();
            showBubbleMessage('花を植えました！', 'success');
            return;
        }
        
        // 从 newPlants 中移除
        const idx = newPlants.indexOf(plant);
        if (idx > -1) newPlants.splice(idx, 1);
        
        // 重新渲染植物（显示圆形用户图片或文字）
        const $existingPlant = $('.plant[data-id="' + plant.id + '"]');
        if ($existingPlant.length) {
            // 移除箭头
            $existingPlant.find('.plant-arrow').remove();
            
            // 添加用户图片或文字
            if (pictureUrl) {
                $existingPlant.append($('<div class="plant-user-image"><img src="' + pictureUrl + '" alt="user"></div>'));
            } else if (message && message.trim()) {
                const previewLen = getConfig('interactionConfig.textPlantPreviewLength', 4);
                const displayText = message.length > previewLen ? message.substring(0, previewLen) : message;
                $existingPlant.append($('<div class="plant-user-text">' + displayText + '</div>'));
            }
            
            // 禁用拖拽：移除植物的 mousedown/touchstart 事件
            $existingPlant.off('mousedown touchstart').css('cursor', 'pointer');
            // 当前会话刚投稿的花草显示呼吸动画
            setTimeout(function() {
                const $freshPlant = $('.plant[data-id="' + plant.id + '"]');
                if ($freshPlant.length && isSessionFreshPlant(plant)) {
                    $freshPlant.addClass('plant-new');
                }
            }, 100);
        }
        
        showBubbleMessage('花を植えました！', 'success');
        closeModal();
    } catch (error) {
        showBubbleMessage('植えるのに失敗しました：' + error.message, 'warning');
        $('#submit-btn').prop('disabled', false);
    } finally {
        $.hideLoading();
    }
}

// 点击新种植花草触发投稿流程
function startSubmission(plant) {
    const author = getGardenAuthor();
    if (!author) {
        showAuthorForm(function() {
            showSubmitForm(plant);
        });
    } else {
        showSubmitForm(plant);
    }
}

async function addComment() {
    const text = $('#comment-input').val().trim();
    if (!currentModalPlant) return;
    if (!text) {
        showBubbleMessage('コメントを入力してください', 'warning');
        return;
    }

    const author = getGardenAuthor();
    if (!author) {
        showAuthorForm(function() {
            doAddComment(text);
        });
        return;
    }

    doAddComment(text);
}

async function doAddComment(text) {
    const result = await PostComment(currentModalPlant.recordId, text);
    if (!result.success) {
        showBubbleMessage('コメントの送信に失敗しました：' + result.message, 'warning');
        return;
    }

    const comment = {
        user: getGardenAuthor(),
        text: text,
        cdate: new Date().toISOString()
    };
    currentModalPlant.comments.push(comment);
    currentModalPlant.commentCount = (currentModalPlant.commentCount || 0) + 1;

    const $plant = $('.plant[data-id="' + currentModalPlant.id + '"]');
    let $badge = $plant.find('.comment-badge');
    if ($badge.length === 0) {
        $badge = $('<div class="comment-badge"></div>');
        $plant.append($badge);
    }
    $badge.text(currentModalPlant.commentCount);
    showBubbleMessage('コメントしました！', 'success');
    setTimeout(function() {
        openModal(currentModalPlant);
        $('#comment-input').val('');
    }, getCommentRefreshDelay());
}

function scheduleRandom(fn, minDelay, maxDelay) {
    const delay = rand(minDelay, maxDelay);
    setTimeout(function() { fn(); scheduleRandom(fn, minDelay, maxDelay); }, delay);
}

function spawnButterfly() {
    if (!isDay()) return;

    const el = document.createElement('div');
    el.className = 'bug butterfly';
    document.getElementById('ambient-layer').appendChild(el);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fromLeft = chance(0.5);
    const startX = fromLeft ? -60 : vw + 60;
    const endX = fromLeft ? vw + 60 : -60;
    const baseY = rand(vh * 0.1, vh * 0.7);
    const amplitude = rand(15, 35);
    const duration = rand(12000, 18000);
    const startTime = performance.now();
    const phase = rand(0, Math.PI * 2);

    function frame(now) {
        const t = (now - startTime) / duration;
        if (t >= 1) {
            el.remove();
            return;
        }

        const x = startX + (endX - startX) * t;
        const y = baseY + Math.sin(t * Math.PI * 4 + phase) * amplitude;
        const rotate = Math.sin(t * Math.PI * 4 + phase) * 8;

        if (x < -100 || x > vw + 100) {
            el.remove();
            return;
        }

        el.style.transform = 'translate(' + x + 'px, ' + y + 'px) scaleX(' + (fromLeft ? 1 : -1) + ') rotate(' + rotate + 'deg)';
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

function spawnBee() {
    if (!isDay()) return;

    const el = document.createElement('div');
    el.className = 'bug bee';
    document.getElementById('ambient-layer').appendChild(el);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fromLeft = chance(0.5);
    const startX = fromLeft ? -60 : vw + 60;
    const endX = fromLeft ? vw + 60 : -60;
    const startY = rand(vh * 0.2, vh * 0.8);
    const endY = rand(vh * 0.2, vh * 0.8);
    const duration = rand(8000, 12000);
    const startTime = performance.now();
    const phase = rand(0, Math.PI * 2);

    function frame(now) {
        const t = (now - startTime) / duration;
        if (t >= 1) {
            el.remove();
            return;
        }

        const x = startX + (endX - startX) * t;
        const y = startY + (endY - startY) * t + Math.sin(t * Math.PI * 6 + phase) * 20;
        const facingLeft = endX < startX;

        if (x < -100 || x > vw + 100 || y < -100 || y > vh + 100) {
            el.remove();
            return;
        }

        el.style.transform = 'translate(' + x + 'px, ' + y + 'px) scaleX(' + (facingLeft ? -1 : 1) + ')';
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

function createFireflies() {
    const flies = [];
    const count = window.GARDEN_CONFIG.bugConfig.firefly.count;

    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'bug firefly';
        document.getElementById('ambient-layer').appendChild(el);

        flies.push({
            el: el,
            x: rand(0, window.innerWidth),
            y: rand(0, window.innerHeight),
            vx: rand(-0.12, 0.12),
            vy: rand(-0.08, 0.08),
            phase: rand(0, Math.PI * 2),
            speed: rand(0.001, 0.0022)
        });

        el.style.animationDelay = rand(0, 2.4) + 's';
    }

    function animate(now) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const show = isNight();

        for (const f of flies) {
            f.x += f.vx;
            f.y += f.vy;
            f.x += Math.sin(now * f.speed + f.phase) * 0.15;
            f.y += Math.cos(now * f.speed * 0.8 + f.phase) * 0.12;

            if (f.x < 0 || f.x > vw) f.vx *= -1;
            if (f.y < 0 || f.y > vh) f.vy *= -1;

            f.el.style.transform = 'translate(' + f.x + 'px, ' + f.y + 'px)';
            f.el.style.display = show ? 'block' : 'none';
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}

function spawnMultipleButterflies() {
    const cfg = window.GARDEN_CONFIG.bugConfig.butterfly;
    for (let i = 0; i < cfg.count; i++) {
        setTimeout(spawnButterfly, i * rand(cfg.spawnDelayMin, cfg.spawnDelayMax));
    }
    scheduleRandom(spawnButterfly, cfg.minInterval, cfg.maxInterval);
}

function spawnMultipleBees() {
    const cfg = window.GARDEN_CONFIG.bugConfig.bee;
    for (let i = 0; i < cfg.count; i++) {
        setTimeout(spawnBee, i * rand(cfg.spawnDelayMin, cfg.spawnDelayMax));
    }
    scheduleRandom(spawnBee, cfg.minInterval, cfg.maxInterval);
}

function initGarden() {
    const cfg = window.GARDEN_CONFIG;

    // 规范化植物图片路径：统一添加 plant/ 前缀和 .png 后缀
    if (cfg.plantImages && cfg.plantImages.length > 0) {
        cfg.plantImages = cfg.plantImages
            .filter(function(img) { return img && img.trim(); })
            .map(function(img) {
                let name = img.replace(/^plant\//, '').replace(/\.png$/, '');
                return 'plant/' + name + '.png';
            });
    }

    // 安全检查：如果没有植物图片，给出警告
    if (!cfg.plantImages || cfg.plantImages.length === 0) {
        console.error('植物图片列表为空，请检查 index.html 中的 plantImages 配置');
    }

    updateTimeOverlay();
    setInterval(function() {
        updateTimeOverlay();
    }, cfg.uiConfig.timeUpdateInterval);

    // 保存数据到 data.json 和 comment.json
    async function saveData() {
        const plantsData = plants.map(plant => ({
            id: plant.recordId || plant.id.toString(),
            name: plant.userName || '匿名用户',
            content: plant.userContent || '',
            picture: plant.userImage || '',
            pubdate: plant.createdTime ? new Date(plant.createdTime).toISOString() : new Date().toISOString(),
            entry_type: 'garden',
            key_id: plant.id,
            likes: plant.likes || 0,
            comments: plant.comments ? plant.comments.length : 0,
            x: plant.x,
            y: plant.y,
            flowerName: cfg.plantImages[plant.imageIndex]?.split('/').pop().replace('.png', '') || '未知花草'
        }));

        // 收集所有评论数据（通过 pid 关联到对应的稿件）
        const allComments = [];
        plants.forEach(plant => {
            if (plant.comments && plant.comments.length > 0) {
                plant.comments.forEach(comment => {
                    allComments.push({
                        pid: plant.recordId || plant.id.toString(),
                        name: comment.user || '匿名用户',
                        comment: comment.text || '',
                        Cdate: comment.cdate || new Date().toISOString()
                    });
                });
            }
        });

        try {
            // 下载 data.json 文件
            const dataStr = JSON.stringify({ data: plantsData }, null, 4);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const dataUrl = URL.createObjectURL(dataBlob);
            const dataA = document.createElement('a');
            dataA.href = dataUrl;
            dataA.download = 'data.json';
            document.body.appendChild(dataA);
            dataA.click();
            document.body.removeChild(dataA);
            URL.revokeObjectURL(dataUrl);

            // 下载 comment.json 文件
            const commentsStr = JSON.stringify({ comments: allComments }, null, 4);
            const commentsBlob = new Blob([commentsStr], { type: 'application/json' });
            const commentsUrl = URL.createObjectURL(commentsBlob);
            const commentsA = document.createElement('a');
            commentsA.href = commentsUrl;
            commentsA.download = 'comment.json';
            document.body.appendChild(commentsA);
            commentsA.click();
            document.body.removeChild(commentsA);
            URL.revokeObjectURL(commentsUrl);

            // 显示保存成功提示
            showBubbleMessage('データを保存しました！', 'success');
        } catch (error) {
            console.error('保存に失敗しました：', error);
            showBubbleMessage('保存に失敗しました：' + error.message, 'warning');
        }
    }

    // 绑定弹窗关闭按钮事件
    $('#modal-close').on('click', closeModal);
    $('#modal-overlay').on('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });

    // 检测两个植物是否重叠绑定种植按钮事件
    $('#plant-btn').on('click', createPlant);

    $('#zoom-in').on('click', function() {
        scale = Math.min(scale * cfg.zoomConfig.scaleFactor, cfg.zoomConfig.maxScale);
        updateTransform();
    });

    $('#zoom-out').on('click', function() {
        scale = scale / cfg.zoomConfig.scaleFactor;
        updateTransform();
    });

    $('#zoom-reset').on('click', function() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
    });

    $('#garden-container').on('mousedown', function(e) {
        if ($(e.target).closest('.plant').length === 0) {
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
        }
    });

    $(document).on('mousemove', function(e) {
        if (isDragging) {
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        }
    });

    $(document).on('mouseup', function() { isDragging = false; });

    $('#garden-container').on('wheel', function(e) {
        e.preventDefault();
        const delta = e.originalEvent.deltaY > 0 ? 1 / cfg.zoomConfig.wheelFactor : cfg.zoomConfig.wheelFactor;
        const oldScale = scale;
        scale = scale * delta;

        const worldX = (e.clientX - translateX) / oldScale;
        const worldY = (e.clientY - translateY) / oldScale;

        translateX = e.clientX - worldX * scale;
        translateY = e.clientY - worldY * scale;
        updateTransform();
    });

    // ===== 移动端触摸支持 =====
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchDragging = false;
    let lastTouchDistance = 0;
    let touchStartScale = 1;

    const gardenEl = document.getElementById('garden-container');

    gardenEl.addEventListener('touchstart', function(e) {
        const touches = e.touches;
        if (touches.length === 1) {
            if (!e.target.closest('.plant')) {
                isTouchDragging = true;
                touchStartX = touches[0].clientX - translateX;
                touchStartY = touches[0].clientY - translateY;
            }
        } else if (touches.length === 2) {
            isTouchDragging = false;
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
            touchStartScale = scale;
        }
    }, { passive: false });

    gardenEl.addEventListener('touchmove', function(e) {
        const touches = e.touches;
        if (touches.length === 1 && isTouchDragging) {
            e.preventDefault();
            translateX = touches[0].clientX - touchStartX;
            translateY = touches[0].clientY - touchStartY;
            updateTransform();
        } else if (touches.length === 2) {
            e.preventDefault();
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (lastTouchDistance > 0) {
                const ratio = distance / lastTouchDistance;
                const oldScale = scale;
                scale = touchStartScale * ratio;
                const centerX = (touches[0].clientX + touches[1].clientX) / 2;
                const centerY = (touches[0].clientY + touches[1].clientY) / 2;
                const worldX = (centerX - translateX) / oldScale;
                const worldY = (centerY - translateY) / oldScale;
                translateX = centerX - worldX * scale;
                translateY = centerY - worldY * scale;
                updateTransform();
            }
        }
    }, { passive: false });

    gardenEl.addEventListener('touchend', function(e) {
        isTouchDragging = false;
        lastTouchDistance = 0;
    });

    // 从 GS API 加载数据，失败时回退到本地 JSON
    async function loadGardenData() {
        try {
            var data = null;
            var comments = null;

            // 优先从 GS API 加载评论数据
            try {
                comments = await getData("getallcomment");
                if (!comments || comments.length === 0) {
                    comments = null;
                }
            } catch (apiError) {
                console.warn('GS 评论数据加载失败，尝试从 comment.json 加载');
            }

            // 如果 API 评论加载失败，尝试从本地加载
            if (!comments) {
                try {
                    const commentsResponse = await fetch('comment.json');
                    if (commentsResponse.ok) {
                        const commentsData = await commentsResponse.json();
                        comments = commentsData.data || [];
                    }
                } catch (jsonError) {
                    comments = [];
                }
            }

            // 优先从 GS API 加载稿件数据
            try {
                data = await getData("getallrecords");
                if (!data || data.length === 0) {
                    data = null;
                }
            } catch (apiError) {
                console.warn('GS 稿件数据加载失败，尝试从 data.json 加载');
            }

            // 如果 API 稿件加载失败，尝试从本地加载
            if (!data) {
                try {
                    const dataResponse = await fetch('data.json');
                    if (!dataResponse.ok) {
                        throw new Error('data.json 不存在');
                    }
                    const jsonData = await dataResponse.json();
                    data = jsonData.data || [];
                } catch (jsonError) {
                    console.error('本地 data.json 也加载失败');
                }
            }

            if (data && data.length > 0) {
                // 构建评论缓存
                buildCommentCache(comments || []);
                
                // 计算最新日期
                const pubDates = data.map(function(r) {
                    return r.pubdate || r.PubDate || '';
                }).filter(function(d) { return d; });
                const commentDates = (comments || []).map(function(c) {
                    return c.Cdate || c.cdate || '';
                }).filter(function(d) { return d; });
                const allDates = pubDates.concat(commentDates);
                latestPubDate = getLatestDateFromDateArray(allDates);
                
                data.forEach(function(record, index) {
                    const plant = createPlantFromRecord(record);
                    
                    // 从缓存获取评论
                    const recordComments = commentCacheByRid.get(plant.recordId);
                    if (recordComments && recordComments.length > 0) {
                        recordComments.forEach(function(comment) {
                            plant.comments.push({
                                user: comment.name || '匿名用户',
                                text: comment.comment || '',
                                cdate: comment.Cdate || new Date().toISOString()
                            });
                        });
                    }
                    
                    registerPlant(plant);
                    renderPlant(plant);
                });
            }
        } catch (error) {
            console.error('加载数据失败:', error);
        }
    }
    
    setupInitialViewport();

    (async function initializeGardenView() {
        try {
            await loadGardenData();

            const reaccessNewPlants = await handleKeyReaccessFeedback();

            if (latestPubDate) {
                startPolling();
            }

            if (!reaccessUsedCustomViewport) {
                repositionViewportToPlants();
            }

            revealGarden();

            if (reaccessNewPlants && reaccessNewPlants.length > 0) {
                showReaccessMessage();
                startNewFlowerSwayForPlants(reaccessNewPlants);
            }
        } catch (error) {
            console.error('庭の初期化に失敗しました:', error);
            revealGarden();
        } finally {
            $.hideLoading();
            initOnboarding();
        }
    })();

    // 启动活跃度检查（记录 home 访问并定时检查）
    startActivityCheck();

    spawnMultipleButterflies();
    spawnMultipleBees();
    createFireflies();
}

// 设置初始视口（Garden 保持隐藏，由 revealGarden() 显示）
function setupInitialViewport() {
    const cfg = window.GARDEN_CONFIG;
    scale = getInitialScale();

    const bounds = getViewportClampBounds();
    translateX = getConfig('interactionConfig.initialTranslateRandom', true) ? rand(bounds.minTranslateX, 0) : 0;
    translateY = rand(bounds.minTranslateY, 0);

    updateTransform();
    $.showLoading({ opaque: true });
}

function revealGarden() {
    $('#garden-world').css('visibility', 'visible');
}

// 重新定位视口，保证至少一株花草在可见区域内
function repositionViewportToPlants() {
    if (plants.length === 0) {
        return;
    }

    const cfg = window.GARDEN_CONFIG;
    const bounds = getViewportClampBounds();
    const worldCenterX = cfg.worldSize.width / 2;
    const worldCenterY = cfg.worldSize.height / 2;

    const candidates = plants.slice().sort(function(a, b) {
        const distA = Math.pow(a.x - worldCenterX, 2) + Math.pow(a.y - worldCenterY, 2);
        const distB = Math.pow(b.x - worldCenterX, 2) + Math.pow(b.y - worldCenterY, 2);
        return distA - distB;
    });

    for (let i = 0; i < candidates.length; i++) {
        const clamped = computeViewportForPlant(candidates[i], bounds);
        if (isPlantComfortablyVisible(candidates[i], clamped.translateX, clamped.translateY, bounds)) {
            translateX = clamped.translateX;
            translateY = clamped.translateY;
            updateTransform();
            return;
        }
    }

    const fallback = computeViewportForPlant(candidates[0], bounds);
    translateX = fallback.translateX;
    translateY = fallback.translateY;
    updateTransform();
}

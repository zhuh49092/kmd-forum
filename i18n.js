(function(window) {
    'use strict';

    const STORAGE_KEY = 'garden_lang';

    const translations = {
        ja: {
            'page.title': 'みなのガーデン',
            'plantBtn.title': '花を植える',
            'lang.pickHeading': '言語を選んでください',
            'lang.pickSubheading': 'Choose your language',
            'lang.ja': '日本語',
            'lang.en': 'English',
            'lang.switchJa': '日本語',
            'lang.switchEn': 'EN',
            'toast.newFlower': '新しい花が咲きました！',
            'toast.someonePlaying': '今、庭で誰かが遊んでいます！',
            'toast.visitors': '今日はすでに {count} 人が庭に来ています！',
            'garden.full': '庭がいっぱいです！空いている場所を探してみてください。',
            'garden.overlap': 'ここにはすでに花があります。空いている場所を探してください。',
            'garden.plantCancelled': '植えるのをキャンセルしました。',
            'plant.whatFlower': 'どんな花を植えたい？',
            'plant.tapToPlant': 'タップで植える｜左右で花を選ぶ',
            'plant.moveHint': '花を押して好きな位置に移動しましょう',
            'onboarding.step1': '指で庭を探検しよう。<br>ピンチで拡大・縮小できます。',
            'onboarding.step2': '花を押すと、<br>みんなのお話が見れます',
            'onboarding.step3': 'ボタンから花を植えます',
            'modal.titleRecord': '花の記録',
            'modal.titleNewPlant': '新しく植えた花',
            'modal.noContent': 'まだ内容がありません',
            'modal.comments': 'コメント',
            'modal.noComments': 'まだコメントはありません。最初に書いてみよう！',
            'modal.commentPlaceholder': 'コメントを書いてみよう…',
            'modal.send': '送信',
            'modal.newPlantBody1': '新しく植えた花です。まだ投稿がありません。',
            'modal.newPlantBody2': '閉じてからもう一度タップすると投稿できます。',
            'modal.imageAlt': '画像',
            'fallback.anonymous': '匿名',
            'fallback.anonymousUser': '匿名',
            'author.title': 'ニックネームを入力',
            'author.label': 'ニックネーム',
            'author.placeholder': 'はじめての投稿ですね。表示名を入力してください。',
            'author.confirm': '確定',
            'author.required': '表示名は必須です。',
            'submit.title': '花を植える',
            'submit.photoPrompt': '言葉はいらない。<br>イベントで見つけた1枚、<br>花の肥料になる。',
            'submit.photoLabel': '写真\u3000（人物の顔が写らないもの）',
            'submit.clickToSelect': 'クリックで選択／撮る',
            'submit.plant': '植える',
            'submit.noPhotoSwitch': '写真がない？文字でもいいぞ。',
            'submit.textLabel': '話したいこと',
            'submit.textPlaceholder': '今日の天気がいいね……',
            'submit.backToPhoto': '写真に戻る',
            'error.invalidImageType': '画像ファイルを選択してください',
            'error.photoRequired': '写真を選んでから植えてね',
            'error.messageRequired': 'メッセージを書いてから植えてね',
            'error.uploadFailed': 'アップロードに失敗しました: {msg}',
            'error.plantFailed': '植えるのに失敗しました：{msg}',
            'error.commentRequired': 'コメントを入力してください',
            'error.commentFailed': 'コメントの送信に失敗しました：{msg}',
            'success.planted': '花を植えました！',
            'success.commented': 'コメントしました！',
            'loading.savePosition': '花の位置をセーブ中……',
            'error.selectImageFile': '画像ファイルを選択してください',
            'error.imageProcess': '画像処理に失敗しました: {msg}',
            'error.imageLoad': '画像の読み込みに失敗しました',
            'error.fileRead': 'ファイルの読み込みに失敗しました',
            'error.unknown': '不明なエラー',
            'error.fetchData': 'データの取得に失敗しました',
            'alt.plantPreview': '花プレビュー',
            'alt.plant': '花',
            'alt.user': '投稿内容',
            'alt.preview': 'プレビュー'
        },
        en: {
            'page.title': 'Minano Garden',
            'plantBtn.title': 'Plant a flower',
            'lang.pickHeading': '言語を選んでください',
            'lang.pickSubheading': 'Choose your language',
            'lang.ja': '日本語',
            'lang.en': 'English',
            'lang.switchJa': '日本語',
            'lang.switchEn': 'EN',
            'toast.newFlower': 'A new flower has bloomed!',
            'toast.someonePlaying': 'Someone is in the garden right now!',
            'toast.visitors': '{count} people have visited the garden today!',
            'garden.full': 'The garden is full! Try finding an open spot.',
            'garden.overlap': 'There is already a flower here. Try finding an open spot.',
            'garden.plantCancelled': 'Planting cancelled.',
            'plant.whatFlower': 'What kind of flower do you want?',
            'plant.tapToPlant': 'Tap to plant | Move left/right to choose',
            'plant.moveHint': 'Tap the flower and move it where you like',
            'onboarding.step1': 'Explore the garden with your finger.<br>Pinch to zoom in and out.',
            'onboarding.step2': 'Tap a flower to<br>see everyone\u2019s stories',
            'onboarding.step3': 'Plant a flower from the button',
            'modal.titleRecord': 'Flower record',
            'modal.titleNewPlant': 'Newly planted flower',
            'modal.noContent': 'No content yet',
            'modal.comments': 'Comments',
            'modal.noComments': 'No comments yet. Be the first to write one!',
            'modal.commentPlaceholder': 'Write a comment\u2026',
            'modal.send': 'Send',
            'modal.newPlantBody1': 'This is a newly planted flower. It hasn\u2019t been posted yet.',
            'modal.newPlantBody2': 'Close and tap again to post.',
            'modal.imageAlt': 'Image',
            'fallback.anonymous': 'Anonymous',
            'fallback.anonymousUser': 'Anonymous',
            'author.title': 'Enter your nickname',
            'author.label': 'Nickname',
            'author.placeholder': 'First time posting? Enter a display name.',
            'author.confirm': 'Confirm',
            'author.required': 'Display name is required.',
            'submit.title': 'Plant a flower',
            'submit.photoPrompt': 'No words needed.<br>One photo from the event<br>can help a flower grow.',
            'submit.photoLabel': 'Photo (no faces please)',
            'submit.clickToSelect': 'Click to choose / take a photo',
            'submit.plant': 'Plant',
            'submit.noPhotoSwitch': 'No photo? You can write instead.',
            'submit.textLabel': 'What\u2019s on your mind',
            'submit.textPlaceholder': 'The weather is nice today\u2026',
            'submit.backToPhoto': 'Back to photo',
            'error.invalidImageType': 'Please select an image file',
            'error.photoRequired': 'Choose a photo before planting',
            'error.messageRequired': 'Write a message before planting',
            'error.uploadFailed': 'Upload failed: {msg}',
            'error.plantFailed': 'Failed to plant: {msg}',
            'error.commentRequired': 'Please enter a comment',
            'error.commentFailed': 'Failed to send comment: {msg}',
            'success.planted': 'Your flower has been planted!',
            'success.commented': 'Comment posted!',
            'loading.savePosition': 'Saving flower position\u2026',
            'error.selectImageFile': 'Please select an image file',
            'error.imageProcess': 'Image processing failed: {msg}',
            'error.imageLoad': 'Failed to load image',
            'error.fileRead': 'Failed to read file',
            'error.unknown': 'Unknown error',
            'error.fetchData': 'Failed to fetch data',
            'alt.plantPreview': 'Flower preview',
            'alt.plant': 'Flower',
            'alt.user': 'User content',
            'alt.preview': 'Preview'
        }
    };

    let currentLanguage = 'ja';
    let gardenStarted = false;
    const languageChangeCallbacks = [];

    function getSavedLanguage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'ja' || saved === 'en') {
                return saved;
            }
        } catch (e) {}
        return null;
    }

    function t(key, params) {
        const dict = translations[currentLanguage] || translations.ja;
        let text = dict[key];
        if (text === undefined) {
            text = translations.ja[key] || key;
        }
        if (params) {
            Object.keys(params).forEach(function(name) {
                text = text.split('{' + name + '}').join(String(params[name]));
            });
        }
        return text;
    }

    function getDateLocale() {
        return currentLanguage === 'en' ? 'en-US' : 'ja-JP';
    }

    function applyStaticI18n() {
        document.title = t('page.title');
        const plantBtn = document.getElementById('plant-btn');
        if (plantBtn) {
            plantBtn.setAttribute('title', t('plantBtn.title'));
        }
    }

    function updateLanguageSwitchUI() {
        const $switch = $('#lang-switch');
        if ($switch.length === 0) {
            return;
        }
        $switch.find('[data-lang="ja"]').toggleClass('is-active', currentLanguage === 'ja');
        $switch.find('[data-lang="en"]').toggleClass('is-active', currentLanguage === 'en');
    }

    function setLanguage(lang) {
        if (lang !== 'ja' && lang !== 'en') {
            lang = 'ja';
        }
        currentLanguage = lang;
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (e) {}
        document.documentElement.lang = lang === 'en' ? 'en' : 'ja';
        applyStaticI18n();
        updateLanguageSwitchUI();
        languageChangeCallbacks.forEach(function(callback) {
            callback(currentLanguage);
        });
    }

    function onLanguageChange(callback) {
        if (typeof callback === 'function') {
            languageChangeCallbacks.push(callback);
        }
    }

    function showLanguageSelectionOverlay(onComplete) {
        if ($('#lang-picker-overlay').length > 0) {
            return;
        }

        const $overlay = $(
            '<div id="lang-picker-overlay">' +
                '<div class="lang-picker-panel">' +
                    '<h1 class="lang-picker-heading">' + t('lang.pickHeading') + '</h1>' +
                    '<p class="lang-picker-subheading">' + t('lang.pickSubheading') + '</p>' +
                    '<div class="lang-picker-actions">' +
                        '<button type="button" class="lang-picker-btn" data-lang="ja">' + t('lang.ja') + '</button>' +
                        '<button type="button" class="lang-picker-btn" data-lang="en">' + t('lang.en') + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );

        $('body').append($overlay);

        $overlay.find('.lang-picker-btn').on('click', function() {
            const chosen = $(this).attr('data-lang');
            setLanguage(chosen === 'en' ? 'en' : 'ja');
            $overlay.remove();
            if (typeof onComplete === 'function') {
                onComplete();
            }
        });
    }

    function initInSiteLanguageSwitch() {
        if ($('#lang-switch').length > 0) {
            updateLanguageSwitchUI();
            return;
        }

        const $switch = $(
            '<div id="lang-switch" aria-label="Language">' +
                '<button type="button" class="lang-switch-btn" data-lang="ja">' + t('lang.switchJa') + '</button>' +
                '<span class="lang-switch-sep">|</span>' +
                '<button type="button" class="lang-switch-btn" data-lang="en">' + t('lang.switchEn') + '</button>' +
            '</div>'
        );

        $('body').append($switch);
        updateLanguageSwitchUI();

        $switch.on('click', '.lang-switch-btn', function() {
            const chosen = $(this).attr('data-lang');
            if (chosen === currentLanguage) {
                return;
            }
            setLanguage(chosen === 'en' ? 'en' : 'ja');
        });
    }

    function bootstrapGarden() {
        if (gardenStarted) {
            return;
        }

        const proceed = function() {
            if (gardenStarted) {
                return;
            }
            gardenStarted = true;
            if (typeof window.initGarden === 'function') {
                window.initGarden();
            }
        };

        const saved = getSavedLanguage();
        if (saved) {
            setLanguage(saved);
            proceed();
        } else {
            showLanguageSelectionOverlay(proceed);
        }
    }

    window.t = t;
    window.getDateLocale = getDateLocale;
    window.getSavedLanguage = getSavedLanguage;
    window.setLanguage = setLanguage;
    window.onLanguageChange = onLanguageChange;
    window.initInSiteLanguageSwitch = initInSiteLanguageSwitch;
    window.bootstrapGarden = bootstrapGarden;
    window.getCurrentLanguage = function() {
        return currentLanguage;
    };
})(window);

const previewLog = (...args) => console.log('[StreamKey:preview]', ...args);

function makeTwitchPlayer(container, channel) {
    const player = new window.Twitch.Player(container, {
        channel,
        muted: true,
        autoplay: true,
        controls: false,
        width: '100%',
        height: '100%',
        parent: [window.location.hostname],
    });
    return player;
}

function injectStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).append(style);
}

function observeAdded(root, onNode) {
    new MutationObserver(mutations => {
        requestAnimationFrame(() => {
            for (const { addedNodes } of mutations) {
                for (const node of addedNodes) {
                    if (node instanceof HTMLElement) onNode(node);
                }
            }
        });
    }).observe(root, { childList: true, subtree: true });
}

function waitForVideoReady(player) {
    return new Promise(resolve => {
        const handler = () => {
            player.removeEventListener(window.Twitch.Player.VIDEO_READY, handler);
            resolve();
        };
        player.addEventListener(window.Twitch.Player.VIDEO_READY, handler);
    });
}

(function () {
    const marker = 'streamkey-main-hover-player';
    const cssClass = 'streamkey-main-embed-frame';

    injectStyle(`
        .preview-card-image-link {
            position: relative;
            display: block;
        }

        .${cssClass} {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 5;
            background: black;
            pointer-events: none;
            border: 0;
        }

        .${cssClass} iframe {
            border: 0;
            display: block;
        }
    `);

    window.addEventListener('blur', () => {
        setTimeout(() => {
            const active = document.activeElement;
            if (active && active.classList.contains(cssClass)) {
                const parentLink = active.closest('.preview-card-image-link');
                if (parentLink && parentLink.href) {
                    window.location.href = parentLink.href;
                }
            }
        }, 100);
    });

    function attach(card) {
        if (card.dataset.streamkeyBound) return;
        card.dataset.streamkeyBound = '1';

        let player = null;
        let container = null;

        card.addEventListener('mouseenter', async () => {
            const channel = card.getAttribute('href')?.split('/')[1]?.split('?')[0];
            if (!channel || channel === 'directory') return;

            if (container) return;

            container = document.createElement('div');
            container.dataset.embedId = marker;
            container.className = cssClass;
            card.append(container);


            if (!container || !container.isConnected) return;

            player = makeTwitchPlayer(container, channel);

            player.addEventListener(window.Twitch.Player.READY, () => {
                player.setMuted(true);
                player.play();
            });
        });

        card.addEventListener('mouseleave', () => {
            if (container) {
                container.remove();
                container = null;
            }

            if (player) {
                try { player.pause(); } catch { }
                player = null;
                window.focus();
            }
        });
    }

    function scan(node) {
        node.querySelectorAll?.('[id="front-page-main-content"] .preview-card-image-link').forEach(attach);
        if (node.classList?.contains('preview-card-image-link')) attach(node);
    }

    observeAdded(document.body, scan);
    scan(document);
})();

(function () {
    const marker = 'streamkey-sidebar-hover-player';
    const cssClass = 'streamkey-sidebar-embed-frame';
    const rootSelector = 'nav#side-nav';

    let player = null;
    let playerContainer = null;
    let swapTimeout = null;
    let activeChannel = null;
    let isVideoReady = false;

    injectStyle(`
        .${cssClass} {
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 0 0 6px 6px;
            margin-top: 2px;
            background: black;
            order: 10;
            border: 0;
            overflow: hidden;
        }

        .${cssClass} iframe {
            border: 0;
            display: block;
        }
    `);

    function waitForRoot(selector) {
        return new Promise(resolve => {
            const el = document.querySelector(selector);
            if (el) { resolve(el); return; }

            const observer = new MutationObserver(() => {
                requestAnimationFrame(() => {
                    const el = document.querySelector(selector);
                    if (el) {
                        observer.disconnect();
                        resolve(el);
                    }
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    function destroyPlayer() {
        // previewLog('sidebar: destroyPlayer', { activeChannel });
        clearTimeout(swapTimeout);
        if (player) {
            if (isVideoReady) { try { player.pause(); } catch { } }
            player = null;
        }
        document.querySelectorAll(`[data-embed-id="${marker}"]`).forEach(el => el.remove());
        playerContainer = null;
        activeChannel = null;
        isVideoReady = false;
    }

    async function createPlayer(balloon, channel) {
        if (playerContainer) {
            // previewLog('sidebar: createPlayer aborted, container already exists', { channel });
            return;
        }

        playerContainer = document.createElement('div');
        playerContainer.dataset.embedId = marker;
        playerContainer.className = cssClass;
        balloon.appendChild(playerContainer);
        // previewLog('sidebar: player container appended to balloon', { channel });


        if (
            activeChannel !== channel ||
            !balloon.isConnected ||
            !playerContainer ||
            !playerContainer.isConnected
        ) {
            // previewLog('sidebar: createPlayer aborted after sdk load', {
                // channel,
                // activeChannel,
                // balloonConnected: balloon.isConnected,
                // containerConnected: playerContainer?.isConnected,
            // });
            playerContainer?.remove();
            playerContainer = null;
            return;
        }

        player = makeTwitchPlayer(playerContainer, channel);
        isVideoReady = false;
        // previewLog('sidebar: Twitch.Player created', { channel });

        player.addEventListener(window.Twitch.Player.READY, () => {
            // previewLog('sidebar: player READY', { channel });
            player.setMuted(true);
            player.play();
        });

        player.addEventListener(window.Twitch.Player.VIDEO_READY, () => {
            // previewLog('sidebar: player VIDEO_READY', { channel });
            isVideoReady = true;
            player.setMuted(true);
            player.play();
        });
    }

    function switchChannel(channel) {
        clearTimeout(swapTimeout);
        swapTimeout = setTimeout(async () => {
            if (!player || activeChannel !== channel) {
                // previewLog('sidebar: switchChannel aborted before setChannel', { channel, activeChannel, hasPlayer: !!player });
                return;
            }
            isVideoReady = false;
            player.setChannel(channel);
            // previewLog('sidebar: switchChannel setChannel called', { channel });
            await waitForVideoReady(player);
            if (!player || activeChannel !== channel) {
                // previewLog('sidebar: switchChannel aborted after waitForVideoReady', { channel, activeChannel, hasPlayer: !!player });
                return;
            }
            isVideoReady = true;
            player.setMuted(true);
            player.play();
            // previewLog('sidebar: switchChannel video ready', { channel });
        }, 250);
    }

    function isOffline(balloon) {
        const text = balloon.innerText;
        const hasVideosLink = !!balloon.querySelector('a[href$="/videos?filter=all"]');
        return text.includes('Offline') || text.includes('Не в эфире') || hasVideosLink;
    }

    function onBalloonAppeared(balloon, channel) {
        const offline = isOffline(balloon);
        // previewLog('sidebar: balloon appeared', {
            // channel,
            // offline,
            // balloonText: balloon.innerText?.slice(0, 200),
            // balloonHTML: balloon.outerHTML.slice(0, 500),
        // });

        if (offline) {
            // previewLog('sidebar: channel considered offline, skipping player', { channel });
            return;
        }

        balloon.style.width = '350px';
        activeChannel = channel;

        if (player) {
            // previewLog('sidebar: switching existing player', { channel });
            switchChannel(channel);
        } else {
            // previewLog('sidebar: creating new player', { channel });
            createPlayer(balloon, channel);
        }

        const removalObserver = new MutationObserver(() => {
            if (!balloon.isConnected) {
                // previewLog('sidebar: balloon removed from DOM', { channel });
                removalObserver.disconnect();
                destroyPlayer();
            }
        });
        removalObserver.observe(document.body, { childList: true, subtree: true });
    }

    function attachToCard(card) {
        if (card.dataset.streamkeyBound) return;
        card.dataset.streamkeyBound = '1';

        const channel = card.querySelector('a[href^="/"]')
            ?.getAttribute('href')?.split('/')[1]?.split('?')[0];

        if (!channel || channel === 'directory' || channel === 'videos') return;

        // previewLog('sidebar: card bound', { channel });

        card.addEventListener('mouseenter', () => {
            // previewLog('sidebar: mouseenter', { channel });
            waitForBalloon(card, channel);
        });

        card.addEventListener('mouseleave', () => {
            // previewLog('sidebar: mouseleave', { channel });
            cancelWaitForBalloon(card);
        });
    }

    const pendingBalloonObservers = new WeakMap();

    function cancelWaitForBalloon(card) {
        const obs = pendingBalloonObservers.get(card);
        if (obs) {
            obs.disconnect();
            pendingBalloonObservers.delete(card);
        }
    }

    function waitForBalloon(card, channel) {
        if (pendingBalloonObservers.has(card)) {
            // previewLog('sidebar: waitForBalloon already pending', { channel });
            return;
        }

        // previewLog('sidebar: waitForBalloon start', { channel });

        const existing = findBalloon();
        if (existing) {
            // previewLog('sidebar: balloon already present', { channel });
            onBalloonAppeared(existing, channel);
            return;
        }

        let mutationCount = 0;
        const obs = new MutationObserver(() => {
            mutationCount++;
            requestAnimationFrame(() => {
                if (!card.matches(':hover')) {
                    // previewLog('sidebar: card no longer hovered, cancel wait', { channel, mutationCount });
                    cancelWaitForBalloon(card);
                    return;
                }

                const balloon = findBalloon();
                if (balloon) {
                    // previewLog('sidebar: balloon found via observer', { channel, mutationCount });
                    cancelWaitForBalloon(card);
                    onBalloonAppeared(balloon, channel);
                }
            });
        });

        obs.observe(document.body, { childList: true, subtree: true });
        pendingBalloonObservers.set(card, obs);
    }

    function findBalloon() {
        // Twitch больше не использует .tw-balloon для этого тултипа (react-modal + popper.js),
        // но .online-side-nav-channel-tooltip__body остаётся стабильным классом контента тултипа.
        return document.querySelector('.online-side-nav-channel-tooltip__body');
    }

    function scan(node) {
        const cards = node.querySelectorAll?.('.side-nav-card') ?? [];
        cards.forEach(attachToCard);
        if (node.classList?.contains('side-nav-card')) attachToCard(node);
    }

    waitForRoot(rootSelector).then(root => {
        observeAdded(root, scan);
        scan(root);
    });
})();

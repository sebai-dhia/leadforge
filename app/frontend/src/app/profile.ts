import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Lang, Profile, ProfileLink, ProfileStats, TelegramStatus, UsageMap } from './api.service';
import { AuthService } from './auth.service';
import { SpecializationKey, SpecializationPicker } from './specialization-picker';
import { I18n, I18nKey } from './i18n';
import { Toasts } from './toast';
import { linkSite, suggestedLabel } from './link-icons';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink, SpecializationPicker],
  template: `
    @if (loading()) {
      <div class="card skeleton-card" aria-busy="true" [attr.aria-label]="t('profile.loadingAria')"><span></span><span></span><span></span></div>
    } @else if (profile(); as p) {
      <section class="identity">
        <div class="banner"></div>
        <div class="id-body">
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="who">
            <h1>{{ shownName(p) }}</h1>
            <p class="headline">{{ p.headline ? i18n.chip(p.headline) : (auth.isGuest() ? '' : t('profile.addHeadline')) }}</p>
            <div class="facts">
              @if (p.city) { <span>{{ p.city }}</span> }
              <span>{{ t('profile.writesIn', { lang: langName(p.language) }) }}</span>
              @if (auth.isGuest()) { <span class="guest">{{ t('profile.guestAccount') }}</span> }
            </div>
          </div>
          @if (!editing() && !auth.isGuest()) { <button type="button" class="ghost" (click)="startEdit()">{{ t('profile.edit') }}</button> }
        </div>
      </section>

      @if (auth.isGuest()) {
        <div class="notice guest-note" role="note">
          <span>{{ t('profile.guestLocked') }}</span>
          <button type="button" (click)="signInToEdit()">{{ t('profile.guestSignIn') }}</button>
        </div>
      }

      @if (auth.isGuest()) {
        <section class="card block spec">
          <h2>{{ t('spec.my') }}</h2>
          <p class="mute note">{{ t('spec.sub') }}</p>
          <app-specialization-picker [selected]="p.specialization ?? null" [disabled]="savingSpec()" (picked)="pickSpec($event)" />
          @if (specError(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
        </section>
      }

      @if (editing() && !auth.isGuest()) {
        <form class="card edit" (ngSubmit)="save()">
          <h2>{{ t('profile.edit') }}</h2>
          <div class="two">
            <label>{{ t('profile.fieldName') }} <input name="displayName" required maxlength="100" autocomplete="name" [(ngModel)]="displayName"></label>
            <label>{{ t('profile.fieldCity') }} <input name="city" maxlength="120" [placeholder]="t('ob.basedPh')" [(ngModel)]="city"></label>
          </div>
          <label>{{ t('profile.fieldHeadline') }}
            <input name="headline" maxlength="160" [(ngModel)]="headline">
          </label>
          <label>{{ t('profile.fieldAbout') }}
            <textarea name="about" rows="3" maxlength="500" [(ngModel)]="about"
              placeholder="I design and build simple websites and booking tools for small local businesses."></textarea>
            <span class="help">{{ t('profile.aboutHelp') }}</span>
          </label>
          <fieldset>
            <legend>{{ t('profile.msgLang') }}</legend>
            <div class="seg" role="group" [attr.aria-label]="t('profile.msgLang')">
              @for (l of languages; track l.value) {
                <button type="button" class="seg-btn" [class.on]="language() === l.value"
                  [attr.aria-pressed]="language() === l.value" (click)="language.set(l.value)">{{ l.label }}</button>
              }
            </div>
          </fieldset>
          @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
          <div class="actions">
            <button type="submit" [disabled]="saving()">{{ saving() ? t('profile.saving') : t('profile.save') }}</button>
            <button type="button" class="ghost" (click)="editing.set(false)">{{ t('profile.cancel') }}</button>
          </div>
        </form>
      }

      <div class="cols">
        <div class="col main-col">
          <section class="card block">
            <div class="block-head"><h2>{{ t('profile.offer') }}</h2>@if (!auth.isGuest()) { <a routerLink="/welcome" [queryParams]="{ edit: 1, step: 1 }" class="btn ghost small">{{ t('profile.change') }}</a> }</div>
            @if (p.services.length) {
              <div class="chips">@for (s of p.services; track s) { <span class="chip on">{{ i18n.chip(s) }}</span> }</div>
            } @else if (auth.isGuest()) { <p class="mute">{{ p.offer }}</p> } @else { <p class="mute">{{ t('profile.offerEmpty') }}</p> }
          </section>

          @if (!auth.isGuest() || p.targets.length) {
          <section class="card block">
            <div class="block-head"><h2>{{ t('profile.reach') }}</h2>@if (!auth.isGuest()) { <a routerLink="/welcome" [queryParams]="{ edit: 1, step: 2 }" class="btn ghost small">{{ t('profile.change') }}</a> }</div>
            @if (p.targets.length) {
              <div class="chips">@for (tg of p.targets; track tg) { <span class="chip">{{ i18n.chip(tg) }}</span> }</div>
              <p class="mute note">{{ t('profile.reachNote') }}</p>
            } @else { <p class="mute">{{ t('profile.reachEmpty') }}</p> }
          </section>
          }

          @if (!auth.isGuest() || p.about) {
          <section class="card block">
            <h2>{{ t('profile.about') }}</h2>
            @if (p.about) { <div class="about">{{ p.about }}</div> }
            @else { <p class="mute">{{ t('profile.aboutEmpty') }}</p> }
          </section>
          }
        </div>

        <div class="col side-col">
          @if (!auth.isGuest() || p.links.length) {
          <section class="card block links-card">
            <div class="block-head">
              <h2>{{ t('profile.myLinks') }}</h2>
              @if (!auth.isGuest() && !editingLinks() && p.links.length) { <button type="button" class="btn ghost small" (click)="startLinks()">{{ t('profile.linksEdit') }}</button> }
            </div>

            @if (editingLinks()) {
              <form class="link-form" (ngSubmit)="saveLinks()" novalidate>
                @for (l of linkDraft(); track $index) {
                  <div class="link-edit" [class.bad]="linkErrors()[$index]">
                    <div class="fields">
                      <input class="label" [attr.aria-label]="t('profile.linkName', { n: $index + 1 })" maxlength="30" [placeholder]="t('profile.linkLabelPh')"
                        [ngModel]="l.label" (ngModelChange)="setLink($index, 'label', $event)" [ngModelOptions]="{ standalone: true }">
                      <input class="url" inputmode="url" autocapitalize="off" spellcheck="false" [attr.aria-label]="t('profile.linkAddr', { n: $index + 1 })" maxlength="300" [placeholder]="t('profile.linkUrlPh')"
                        [ngModel]="l.url" (ngModelChange)="setLink($index, 'url', $event)" (blur)="tidyLink($index)" [ngModelOptions]="{ standalone: true }">
                    </div>
                    <button type="button" class="drop" [class.hide]="linkDraft().length === 1 && !l.label && !l.url" [attr.aria-label]="t('profile.removeLink')" (click)="removeLink($index)">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                    @if (linkErrors()[$index]; as e) { <p class="err row-err" role="alert">{{ t(e) }}</p> }
                  </div>
                }
                @if (linkDraft().length < MAX_LINKS && linkDraft()[linkDraft().length - 1].url.trim()) {
                  <button type="button" class="add-row" (click)="addLink()">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                    {{ t('profile.addLink') }}<span class="count num">{{ t('profile.linksCount', { n: linkDraft().length }) }}</span>
                  </button>
                }
                @if (linksError(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
                <div class="actions">
                  <button type="submit" [disabled]="linksSaving()">{{ linksSaving() ? t('profile.saving') : t('profile.linksSave') }}</button>
                  <button type="button" class="ghost" (click)="cancelLinks()" [disabled]="linksSaving()">{{ t('profile.cancel') }}</button>
                </div>
              </form>
            } @else if (p.links.length) {
              <p class="mute note">{{ t('profile.linksHint') }}</p>
              <div class="links">
                @for (l of p.links; track l.url) {
                  <a class="link" [href]="l.url" target="_blank" rel="noopener noreferrer" [attr.aria-label]="t('profile.openLink', { label: l.label })">
                    <span class="badge-ic">
                      @if (siteOf(l.url); as site) {
                        <svg class="brand" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="site.path"/></svg>
                      } @else {
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      }
                    </span>
                    <span class="text"><strong>{{ l.label }}</strong><span class="host">{{ linkHost(l.url) }}</span></span>
                    <svg class="out" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
                  </a>
                }
              </div>
            } @else {
              <div class="links-empty">
                <p><strong>{{ t('profile.linksEmptyTitle') }}</strong></p>
                <p class="mute">{{ t('profile.linksEmptyText') }}</p>
                @if (!auth.isGuest()) { <button type="button" (click)="startLinks()">{{ t('profile.addLink') }}</button> }
              </div>
            }
          </section>
          }

          @if (tg()?.available) {
          <section class="card block tg-card">
            <div class="block-head">
              <h2 class="tg-title"><svg class="tg-ic" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="tgIcon"/></svg>{{ t('tg.title') }}</h2>
              @if (tg()!.connected) { <span class="tg-state"><span class="dot" aria-hidden="true"></span>{{ t('tg.connected') }}</span> }
            </div>
            @if (tg()!.connected) {
              <div class="tg-row">
                <span id="tg-notify">{{ t('tg.notifyLabel') }}</span>
                <button type="button" class="switch" role="switch" aria-labelledby="tg-notify" [attr.aria-checked]="tg()!.notifications"
                  [disabled]="tgBusy()" (click)="toggleTg()"><span class="knob"></span></button>
              </div>
              @if (tg()!.notifications) {
                <label class="tg-hour">
                  <span>{{ t('tg.hourLabel') }}</span>
                  <select [disabled]="tgBusy()" (change)="setTgHour($any($event.target).value)">
                    @for (h of tgHours; track h) { <option [value]="h" [selected]="h === tg()!.hour">{{ hourLabel(h) }}</option> }
                  </select>
                </label>
                <p class="mute note">{{ t('tg.notifyHelp') }}</p>
              } @else {
                <p class="mute note">{{ t('tg.notifyOff') }}</p>
              }
              <div class="tg-actions"><button type="button" class="ghost small" [disabled]="tgBusy()" (click)="disconnectTg()">{{ t('tg.disconnect') }}</button></div>
            } @else if (tgLink(); as url) {
              @if (tgQr(); as qr) {
                <!-- on a computer: Telegram is usually on the phone, so the link is a code for the phone's camera -->
                <div class="tg-qr">
                  <img [src]="qr" width="176" height="176" [alt]="t('tg.qrAlt')">
                  <p><strong>{{ t('tg.scan') }}</strong></p>
                  <p class="mute">{{ t('tg.scanHint') }}</p>
                  <p class="tg-wait" role="status"><span class="pulse" aria-hidden="true"></span>{{ t('tg.waitingStart') }}</p>
                  <div class="tg-quiet">
                    <a class="tg-act" [href]="url" target="_blank" rel="noopener noreferrer">{{ t('tg.desktopLink') }}</a>
                    <span class="sep" aria-hidden="true">·</span>
                    <button type="button" class="tg-act" (click)="stopWaiting()">{{ t('tg.cancel') }}</button>
                  </div>
                  <p class="tg-expiry">{{ t('tg.expiry') }}</p>
                </div>
              } @else {
                <p class="mute tg-text">{{ t('tg.waiting') }}</p>
                <div class="tg-actions">
                  <a class="btn small" [href]="url" target="_blank" rel="noopener noreferrer">{{ t('tg.openAgain') }}</a>
                  <button type="button" class="ghost small" (click)="stopWaiting()">{{ t('tg.cancel') }}</button>
                </div>
              }
            } @else {
              <p class="mute tg-text">{{ t('tg.pitch') }}</p>
              <button type="button" [disabled]="tgBusy()" (click)="connectTg()">{{ tgBusy() ? t('tg.opening') : t('tg.connect') }}</button>
            }
            @if (tgError(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
          </section>
          }

          <section class="card block">
            <h2>{{ t('profile.activity') }}</h2>
            <div class="stats">
              @for (s of statList(); track s.key) {
                <div class="stat"><div class="num big">{{ s.value }}</div><div class="mute">{{ t(s.key) }}</div></div>
              }
            </div>
          </section>

          <section class="card block">
            <h2>{{ t('menu.allowance') }}</h2>
            <p class="mute note">{{ t('menu.frees') }}</p>
            @for (u of usageList(); track u.key) {
              <div class="use">
                <div class="use-row"><span>{{ t(u.key) }}</span><span class="mute">{{ t('menu.left', { left: u.left, limit: u.limit }) }}</span></div>
                <div class="meter" role="img" [attr.aria-label]="t(u.key) + ': ' + t('menu.left', { left: u.left, limit: u.limit })"><div class="fill" [style.width.%]="u.pct"></div></div>
              </div>
            }
          </section>
        </div>
      </div>
    } @else {
      <p class="err" role="alert">{{ error() ? t(error()!) : '' }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    /* the save row is set apart from the fields above it, so the language choice does not read as part of it */
    form:not(.link-form) > .actions { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--line); }
    .identity { background: var(--card); border: 1px solid var(--line); border-radius: 24px; overflow: hidden; margin-bottom: 24px; }
    .banner { height: 96px; background: linear-gradient(120deg, var(--accent-soft), var(--bg) 70%); }
    .id-body { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-end; padding: 0 32px 28px; margin-top: -44px; }
    .avatar { width: 96px; height: 96px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 700; font-size: 38px; border: 4px solid var(--card); flex: none; }
    .who { flex: 1 1 280px; min-width: 0; padding-top: 48px; }
    .who h1 { font-size: 32px; margin: 0; }
    .headline { margin: 6px 0 0; color: var(--ink); opacity: .85; font-size: 17px; }
    .facts { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; color: var(--mute); font-size: 14px; }
    .guest { color: var(--warn); }
    .edit { margin-bottom: 24px; }
    .spec { margin-bottom: 24px; }
    .guest-note { display: flex; gap: 12px 20px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 24px; }
    .edit h2 { margin-top: 0; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 600px) { .two { grid-template-columns: 1fr; } }
    .cols { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
    .main-col { flex: 2 1 540px; } .side-col { flex: 1 1 300px; }
    .col { min-width: 0; display: flex; flex-direction: column; gap: 24px; }
    .block { padding: 26px; margin: 0; }
    .block h2 { margin: 0 0 14px; font-size: 20px; }
    .block-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
    .block-head h2 { margin: 0; }
    .small { min-height: 40px; padding: 0 14px; font-size: 14px; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; }
    .chip { display: inline-flex; align-items: center; min-height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--bg); font-size: 15px; font-weight: 500; }
    .chip.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .note { font-size: 14px; margin: 12px 0 0; } .block h2 + .note { margin: -8px 0 14px; }
    .about { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; font-size: 15.5px; white-space: pre-line; }
    /* the links card: rows that read as a premium list, and an editor that lives in the same card */
    .links { display: flex; flex-direction: column; gap: 8px; }
    .link { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 14px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line); text-decoration: none; color: var(--ink); min-height: 56px; transition: box-shadow .2s ease, background-color .2s ease; }
    .link:hover { box-shadow: inset 0 0 0 1px var(--accent); background: var(--accent-soft); }
    .link:hover .out { color: var(--accent); transform: translate(2px, -2px); }
    .badge-ic { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--card); box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--accent); }
    .badge-ic svg.brand { fill: currentColor; stroke: none; }
    .badge-ic svg, .out { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .text strong { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .host { color: var(--mute); font: 500 12.5px/1.4 var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .out { flex: none; color: var(--mute); transition: transform .2s ease, color .2s ease; }
    .links-empty { text-align: center; padding: 22px 16px; border-radius: 14px; box-shadow: inset 0 0 0 1px var(--line); background: var(--bg); }
    .links-empty p { margin: 0 0 6px; } .links-empty button { margin-top: 10px; }
    .link-form { display: grid; gap: 10px; }
    .link-edit { position: relative; display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: start; padding: 10px; border-radius: 14px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line); }
    .link-edit.bad { box-shadow: inset 0 0 0 1px var(--warn); }
    .link-edit .fields { display: grid; gap: 8px; }
    .link-edit input { margin: 0; min-height: 42px; background: var(--card); }
    .link-edit input.url { font-family: var(--font-mono); font-size: 13.5px; }
    .row-err { grid-column: 1 / -1; margin: 0; font-size: 13px; }
    .drop { min-height: 40px; width: 40px; padding: 0; border-radius: 50%; background: transparent; border: 0; color: var(--mute); }
    .drop:hover { background: var(--accent-soft); color: var(--warn); filter: none; }
    .drop.hide { visibility: hidden; }
    .link-form .actions { margin-top: 6px; display: flex; gap: 10px; }
    .drop svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .add-row { display: flex; align-items: center; justify-content: flex-start; gap: 10px; min-height: 48px; padding: 0 14px; border-radius: 14px; background: transparent; color: var(--ink); border: 0; box-shadow: inset 0 0 0 1px var(--line-strong); font-weight: 500; }
    .add-row:hover { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); filter: none; }
    .add-row svg { width: 18px; height: 18px; fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; }
    .add-row .count { margin-left: auto; color: var(--mute); font-size: 12.5px; }
    @media (prefers-reduced-motion: reduce) { .link, .out { transition: none; } .link:hover .out { transform: none; } }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .stat { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
    .big { font-family: var(--font-display); font-weight: 700; font-size: 28px; line-height: 1.1; color: var(--accent); }
    .use { margin-top: 14px; } .use-row { display: flex; justify-content: space-between; gap: 8px; font-size: 14.5px; margin-bottom: 6px; }
    .meter { height: 6px; border-radius: 6px; background: var(--line); overflow: hidden; }
    .fill { height: 100%; background: var(--accent); border-radius: 6px; }
    /* Telegram: connect once, then one switch for the messages */
    .tg-title { display: flex; align-items: center; gap: 10px; }
    .tg-ic { width: 22px; height: 22px; fill: var(--accent); flex: none; }
    .tg-state { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--accent); }
    .tg-state .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    .tg-text { margin: 0 0 16px; font-size: 15px; }
    .tg-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 15px; }
    .tg-hour { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 16px; font-size: 15px; }
    .tg-hour select { width: auto; min-width: 120px; margin: 0; }
    .tg-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
    .tg-card .err { margin: 12px 0 0; }
    /* one centred column: the code is the only strong element, everything under it is quiet */
    .tg-qr { display: grid; justify-items: center; text-align: center; gap: 6px; }
    /* dark modules on white whatever the theme: phone cameras read that best */
    .tg-qr img { width: 176px; height: 176px; padding: 8px; margin-bottom: 8px; border-radius: 14px; background: #fff; box-shadow: inset 0 0 0 1px var(--line); }
    .tg-qr p { margin: 0; font-size: 15px; max-width: 32ch; }
    .tg-qr .mute { font-size: 14px; }
    .tg-qr .tg-wait { display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13.5px; color: var(--accent); font-weight: 500; }
    .pulse { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: tg-pulse 1.6s ease-in-out infinite; }
    @keyframes tg-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.75); } }
    .tg-quiet { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px 10px; margin-top: 14px; }
    .tg-act { display: inline-flex; align-items: center; min-height: 32px; padding: 4px 6px; border: 0; border-radius: 8px; background: transparent; color: var(--mute); font: inherit; font-size: 14px; font-weight: 500; line-height: 1.4; text-decoration: none; cursor: pointer; transition: color .2s ease; }
    .tg-act:hover { color: var(--accent); filter: none; background: transparent; }
    .sep { color: var(--mute); opacity: .6; }
    .tg-qr .tg-expiry { margin-top: 2px; font-size: 12.5px; color: var(--mute); opacity: .8; }
    .switch { position: relative; flex: none; width: 48px; height: 28px; min-height: 0; padding: 0; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--skeleton); transition: background-color .2s ease, border-color .2s ease; }
    .switch .knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--ink); transition: transform .2s ease; }
    .switch[aria-checked="true"] { background: var(--accent); border-color: var(--accent); }
    .switch[aria-checked="true"] .knob { transform: translateX(20px); background: var(--on-accent); }
    .switch:hover:not(:disabled) { filter: none; border-color: var(--accent); }
    .switch:focus-visible { outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) { .switch, .switch .knob, .tg-act { transition: none; } .pulse { animation: none; } }
  `,
})
export class ProfilePage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;


  protected readonly languages: { value: Lang; label: string }[] = [
    { value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }, { value: 'ar', label: 'العربية' },
  ];

  protected readonly profile = signal<Profile | null>(null);
  private readonly stats = signal<ProfileStats | null>(null);
  private readonly usage = signal<UsageMap | null>(null);
  protected readonly loading = signal(true);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly savingSpec = signal(false);
  protected readonly specError = signal<I18nKey | null>(null);
  protected readonly error = signal<I18nKey | null>(null);

  protected displayName = '';
  protected headline = '';
  protected city = '';
  protected about = '';
  protected readonly language = signal<Lang>('en');
  /** The links card edits on its own: it saves only the links. */
  protected readonly MAX_LINKS = 5;
  protected readonly editingLinks = signal(false);
  protected readonly linkDraft = signal<ProfileLink[]>([]);
  protected readonly linkErrors = signal<(I18nKey | null)[]>([]);
  protected readonly linksSaving = signal(false);
  protected readonly linksError = signal<I18nKey | null>(null);
  private readonly toasts = inject(Toasts);

  protected readonly tg = signal<TelegramStatus | null>(null);
  protected readonly tgLink = signal<string | null>(null);
  /** The link as a QR code image, on a computer only. */
  protected readonly tgQr = signal<string | null>(null);
  /** A phone or tablet: the link opens the Telegram app directly, no code to scan. */
  private readonly onPhone = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  protected readonly tgBusy = signal(false);
  protected readonly tgError = signal<I18nKey | null>(null);
  protected readonly tgIcon = linkSite('https://t.me')?.path ?? '';
  private tgTimer: ReturnType<typeof setInterval> | null = null;
  private tgExpires = 0;
  private readonly onFocus = () => { if (this.tgLink()) this.checkTg(); };

  protected readonly initials = computed(() => {
    const p = this.profile();
    const source = (p?.displayName || p?.email || '?').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  });

  protected readonly statList = computed(() => {
    const s = this.stats();
    return s ? [
      { value: s.leads, key: 'profile.statLeads' as I18nKey }, { value: s.drafted, key: 'profile.statDrafted' as I18nKey },
      { value: s.contacted, key: 'profile.statContacted' as I18nKey }, { value: s.replied, key: 'profile.statReplied' as I18nKey },
    ] : [];
  });

  protected readonly usageList = computed(() => {
    const u = this.usage();
    if (!u) return [];
    const row = (key: I18nKey, x: { used: number; limit: number }) => {
      const left = Math.max(0, x.limit - x.used);
      return { key, left, limit: x.limit, pct: x.limit ? (left / x.limit) * 100 : 0 };
    };
    return [row('menu.searches', u.search), row('menu.lookups', u.enrich), row('menu.messages', u.draft)];
  });

  constructor() {
    this.api.profile().subscribe({
      next: p => { this.profile.set(p); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('profile.errLoad'); },
    });
    this.api.profileStats().subscribe({ next: s => this.stats.set(s), error: () => { /* the page works without it */ } });
    this.api.usage().subscribe({ next: u => this.usage.set(u), error: () => { /* the page works without it */ } });
    this.api.telegram().subscribe({ next: s => this.tg.set(s), error: () => { /* the card stays hidden */ } });
    window.addEventListener('focus', this.onFocus);
    inject(DestroyRef).onDestroy(() => { this.stopWaiting(); window.removeEventListener('focus', this.onFocus); });
  }

  // ---- Telegram: the app opens a one-time t.me link, the person presses Start, and the card sees the chat arrive
  protected connectTg() {
    this.tgBusy.set(true);
    this.tgError.set(null);
    this.api.telegramLink(this.i18n.lang(), Intl.DateTimeFormat().resolvedOptions().timeZone).subscribe({
      next: l => {
        this.tgExpires = new Date(l.expiresAt).getTime();
        if (this.onPhone) {
          this.showLink(l.url);
          window.open(l.url, '_blank', 'noopener'); // if the browser blocks it, the card shows an "Open Telegram" link
          return;
        }
        // without the code (the library failed to load) the card falls back to the "Open Telegram" link
        this.qrFor(l.url).then(qr => { this.tgQr.set(qr); this.showLink(l.url); });
      },
      error: () => { this.tgBusy.set(false); this.tgError.set('tg.err'); },
    });
  }

  private showLink(url: string) {
    this.tgBusy.set(false);
    this.tgLink.set(url);
    this.tgTimer = setInterval(() => this.checkTg(), 3000);
  }

  /** Loaded only when someone connects, so the profile page does not carry the QR library. */
  private async qrFor(url: string): Promise<string | null> {
    try {
      const mod: any = await import('qrcode');
      const qr = (mod.default ?? mod) as typeof import('qrcode');
      return await qr.toDataURL(url, { margin: 1, width: 352, errorCorrectionLevel: 'M', color: { dark: '#0b1210', light: '#ffffff' } });
    } catch {
      return null;
    }
  }

  private checkTg() {
    if (Date.now() > this.tgExpires) {
      this.stopWaiting();
      this.tgError.set('tg.expired');
      return;
    }
    this.api.telegram().subscribe({
      next: s => {
        if (!s.connected || !this.tgLink()) return;
        this.stopWaiting();
        this.tg.set(s);
        this.toasts.show(this.t('tg.done'));
      },
      error: () => { /* the next check tries again */ },
    });
  }

  protected stopWaiting() {
    if (this.tgTimer) clearInterval(this.tgTimer);
    this.tgTimer = null;
    this.tgLink.set(null);
    this.tgQr.set(null);
  }

  /** The hours offered, on the hour: 5:00 to 22:00 (the backend accepts the same range). */
  protected readonly tgHours = Array.from({ length: 18 }, (_, i) => i + 5);

  /** "9:00 AM" in English, "9 h" in French, as the person's own clock would show it. */
  protected hourLabel(h: number): string {
    return new Date(2000, 0, 1, h).toLocaleTimeString(this.i18n.lang() === 'fr' ? 'fr-FR' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  }

  protected setTgHour(value: string) {
    const hour = Number(value);
    if (!Number.isInteger(hour) || hour === this.tg()?.hour) return;
    this.tgBusy.set(true);
    this.tgError.set(null);
    this.api.setTelegram({ hour }).subscribe({
      next: r => { this.tg.set(r); this.tgBusy.set(false); this.toasts.show(this.t('tg.hourSaved', { time: this.hourLabel(r.hour) })); },
      error: () => { this.tgBusy.set(false); this.tgError.set('profile.errSave'); },
    });
  }

  protected toggleTg() {
    const s = this.tg();
    if (!s) return;
    this.tgBusy.set(true);
    this.tgError.set(null);
    this.api.setTelegram({ notifications: !s.notifications }).subscribe({
      next: r => { this.tg.set(r); this.tgBusy.set(false); },
      error: () => { this.tgBusy.set(false); this.tgError.set('profile.errSave'); },
    });
  }

  protected disconnectTg() {
    this.tgBusy.set(true);
    this.tgError.set(null);
    this.api.disconnectTelegram().subscribe({
      next: r => { this.tg.set(r); this.tgBusy.set(false); this.toasts.show(this.t('tg.removed')); },
      error: () => { this.tgBusy.set(false); this.tgError.set('profile.errSave'); },
    });
  }

  /** A guest's default name is shown in the interface language. */
  protected shownName(p: Profile) {
    return this.auth.isGuest() && p.displayName === 'Guest' ? this.t('menu.guest') : (p.displayName || this.t('profile.yourName'));
  }

  protected langName(l: Lang) { return this.t(('lang.' + l) as I18nKey); }

  protected pickSpec(spec: SpecializationKey) {
    if (this.profile()?.specialization === spec) return;
    this.savingSpec.set(true);
    this.specError.set(null);
    this.api.setSpecialization(spec).subscribe({
      next: p => { this.profile.set(p); this.savingSpec.set(false); },
      error: () => { this.savingSpec.set(false); this.specError.set('spec.errSave'); },
    });
  }

  protected signInToEdit() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  protected startEdit() {
    const p = this.profile();
    if (!p) return;
    this.displayName = p.displayName;
    this.headline = p.headline;
    this.city = p.city;
    this.about = p.about;
    this.language.set(p.language);
    this.error.set(null);
    this.editing.set(true);
  }

  // ---- links
  protected linkHost(url: string) { return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, ''); }
  protected siteOf(url: string) { return linkSite(url); }

  protected startLinks() {
    const p = this.profile();
    if (!p) return;
    this.linkDraft.set(p.links.length ? p.links.map(l => ({ ...l })) : [{ label: '', url: '' }]);
    this.linkErrors.set([]);
    this.linksError.set(null);
    this.editingLinks.set(true);
  }
  protected cancelLinks() { this.editingLinks.set(false); }
  protected addLink() { this.linkDraft.set([...this.linkDraft(), { label: '', url: '' }]); }
  protected removeLink(i: number) {
    this.linkDraft.set(this.linkDraft().filter((_, j) => j !== i));
    this.linkErrors.set([]);
  }
  protected setLink(i: number, key: 'label' | 'url', value: string) {
    this.linkDraft.set(this.linkDraft().map((l, j) => (j === i ? { ...l, [key]: value } : l)));
    if (this.linkErrors()[i]) this.linkErrors.set(this.linkErrors().map((e, j) => (j === i ? null : e)));
  }
  /** Forgiving input: "example.com" becomes "https://example.com" when the person leaves the field. */
  protected tidyLink(i: number) {
    const url = this.linkDraft()[i]?.url.trim();
    if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) this.setLink(i, 'url', 'https://' + url);
    // an empty name is filled from the address: "Behance", "GitHub", or the site's own address
    if (url && !this.linkDraft()[i].label.trim()) this.setLink(i, 'label', suggestedLabel(url));
  }

  protected saveLinks() {
    const rows = this.linkDraft().map(l => ({ label: l.label.trim(), url: /^[a-z][a-z0-9+.-]*:/i.test(l.url.trim()) || !l.url.trim() ? l.url.trim() : 'https://' + l.url.trim() }));
    const errors = rows.map((l): I18nKey | null => {
      if (!l.label && !l.url) return null;
      if (!l.label || !l.url) return 'profile.errLinkNeedsBoth';
      return /^https?:\/\/[^\s/.]+\.[^\s]{2,}$/i.test(l.url) ? null : 'profile.errLinkAddress';
    });
    this.linkErrors.set(errors);
    if (errors.some(Boolean)) return;
    this.linksSaving.set(true);
    this.linksError.set(null);
    this.api.saveProfile({ links: rows.filter(l => l.label && l.url) }).subscribe({
      next: p => {
        this.profile.set(p);
        this.linksSaving.set(false);
        this.editingLinks.set(false);
        this.toasts.show(this.t('profile.linksSaved'));
      },
      error: () => { this.linksSaving.set(false); this.linksError.set('profile.errLinksSave'); },
    });
  }

  protected save() {
    this.saving.set(true);
    this.error.set(null);
    this.api.saveProfile({
      displayName: this.displayName, headline: this.headline, city: this.city, about: this.about,
      language: this.language(),
    }).subscribe({
      next: p => { this.profile.set(p); this.saving.set(false); this.editing.set(false); },
      error: e => {
        this.saving.set(false);
        this.error.set(e.status === 400 ? 'profile.err400' : e.status === 403 ? 'profile.err403' : 'profile.errSave');
      },
    });
  }
}

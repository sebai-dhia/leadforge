import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Profile, ProfileLink } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { I18n, I18nKey } from '../../../i18n/i18n';
import { Toasts } from '../../../shared/toast/toast';
import { linkSite, suggestedLabel } from '../../../shared/util/link-icons';

/** The links card edits on its own: it saves only the links. */
@Component({
  selector: 'app-profile-links',
  imports: [FormsModule],
  templateUrl: './profile-links.html',
  styleUrl: './profile-links.scss',
})
export class ProfileLinks {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(Toasts);
  protected readonly auth = inject(AuthService);
  protected readonly t = inject(I18n).t;

  readonly profile = input.required<Profile>();
  /** The profile as the server returned it after the links were saved. */
  readonly saved = output<Profile>();

  protected readonly MAX_LINKS = 5;
  protected readonly editingLinks = signal(false);
  protected readonly linkDraft = signal<ProfileLink[]>([]);
  protected readonly linkErrors = signal<(I18nKey | null)[]>([]);
  protected readonly linksSaving = signal(false);
  protected readonly linksError = signal<I18nKey | null>(null);

  protected linkHost(url: string) { return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, ''); }
  protected siteOf(url: string) { return linkSite(url); }

  protected startLinks() {
    const p = this.profile();
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
        this.saved.emit(p);
        this.linksSaving.set(false);
        this.editingLinks.set(false);
        this.toasts.show(this.t('profile.linksSaved'));
      },
      error: () => { this.linksSaving.set(false); this.linksError.set('profile.errLinksSave'); },
    });
  }
}

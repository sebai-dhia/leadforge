import { Component, computed, inject, input, output } from '@angular/core';
import { AdminPage } from '../../../core/api.service';
import { I18n } from '../../../i18n/i18n';

/** Previous / Next under a list, with the range that is showing. */
@Component({
  selector: 'app-admin-pager',
  templateUrl: './admin-pager.html',
  styleUrl: './admin-pager.scss',
})
export class AdminPager {
  protected readonly t = inject(I18n).t;
  readonly page = input.required<AdminPage<unknown>>();
  readonly pageChange = output<number>();

  protected readonly range = computed(() => {
    const p = this.page();
    return this.t('admin.range', { from: p.page * p.size + 1, to: Math.min(p.total, (p.page + 1) * p.size), total: p.total });
  });
}

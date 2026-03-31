import { type FC } from 'react';
import { useI18n } from '../../i18n';

export const TagsTab: FC = () => {
  const { t } = useI18n();

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-zinc-200">{t('tab.tags')}</h2>
      <p className="text-zinc-500 mt-2">{t('common.sectionInDevelopment')}</p>
    </div>
  );
};

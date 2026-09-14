import { SegmentedControl } from '../components/SegmentedControl';
import { useRoute } from '../router';
import { Record } from './Record';
import { SearchView } from './SearchView';
import { SlidesView } from './SlidesView';

type View = 'recordings' | 'slides' | 'search';

/** Everything from class that is not an assignment: recordings, slides, and one search across them and the syllabi. */
export function Library() {
  const { params, navigate } = useRoute();
  const view = (['recordings', 'slides', 'search'].includes(params.get('v') ?? '') ? params.get('v') : 'recordings') as View;
  const go = (v: View) => navigate('library', v === 'recordings' ? {} : { v });
  return (
    <>
      <div className="lib-head">
        <h1 className="page-title">
          Library <span className="light">{view === 'recordings' ? 'recordings' : view === 'slides' ? 'slides' : 'search'}</span>
        </h1>
        <SegmentedControl
          label="Library section"
          value={view}
          options={[
            { value: 'recordings', label: 'Recordings' },
            { value: 'slides', label: 'Slides' },
            { value: 'search', label: 'Search' },
          ]}
          onChange={(v) => go(v as View)}
        />
      </div>
      {view === 'recordings' && <Record embedded />}
      {view === 'slides' && <SlidesView />}
      {view === 'search' && <SearchView />}
    </>
  );
}

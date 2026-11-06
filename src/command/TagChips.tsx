import { roomTags } from '../../shared/tags.ts';
import { sessionTagHues } from '../design/tag-colors.ts';

/**
 * A session's tags side by side, each in a colour of its own when the settings colour them (Preferences.tagColors,
 * sessionTagHues: two tags of a session never share one).
 * `short`: where room is tight, the first ones then "+N", as on the name tags of the room.
 */
export function TagChips({ tags, className, short = false }: { tags: readonly string[] | undefined; className?: string; short?: boolean }) {
  const classes = className ? `cp-tag ${className}` : 'cp-tag';
  const { shown, more } = short ? roomTags(tags ?? []) : { shown: tags ?? [], more: 0 };
  const hues = sessionTagHues(tags ?? []);
  return (
    <>
      {shown.map((tag, index) => <span key={tag} className={classes} data-hue={hues[index]}>{tag}</span>)}
      {more > 0 && <span className={classes} data-more="true" title={(tags ?? []).slice(shown.length).join(', ')}>+{more}</span>}
    </>
  );
}

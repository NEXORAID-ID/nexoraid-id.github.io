// Proposed review thresholds only. This module never deletes data and
// intentionally does not label order records eligible for deletion.
const day=86400;
export async function retentionReview(db,at=Math.floor(Date.now()/1000)){
 if(!Number.isSafeInteger(at)||at<0)throw Error('Invalid review time');
 const count=async(sql,cutoff)=>(await db.prepare(sql).bind(cutoff).first()).n;
 const [sessions,limits,events,attachments,messages]=await Promise.all([
  count('SELECT COUNT(*) n FROM sessions WHERE expires_at<?',at-30*day),
  count('SELECT COUNT(*) n FROM api_rate_limits WHERE bucket<?',Math.floor((at-7*day)/60)),
  count('SELECT COUNT(*) n FROM audit_events WHERE created_at<?',at-90*day),
  count("SELECT COUNT(*) n FROM order_attachments a JOIN orders o ON o.id=a.order_id WHERE o.status IN ('completed','cancelled') AND o.updated_at<? AND a.created_at<?1",at-180*day),
  count("SELECT COUNT(*) n FROM order_messages a JOIN orders o ON o.id=a.order_id WHERE o.status IN ('completed','cancelled') AND o.updated_at<? AND a.created_at<?1",at-180*day)
 ]);
 return {mode:'review_only',policy_approved:false,deletion_enabled:false,as_of:at,threshold_days:{expired_sessions:30,rate_limits:7,audit_events:90,closed_order_content:180},review_counts:{expired_sessions:sessions,rate_limits:limits,audit_events:events,closed_order_attachments:attachments,closed_order_messages:messages},notice:'Counts are review candidates only. Financial records, disputes, legal holds and evidence must be preserved pending approved retention policy.'};
}

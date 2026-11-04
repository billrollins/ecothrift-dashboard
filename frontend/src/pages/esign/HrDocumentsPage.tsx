/**
 * HR > Requests > Documents (Dash Updates #62; the owner): documents sent to staff to sign in HR > Requests, such as
 * handbook and policy acknowledgments and onboarding forms. Contractor agreements are on Contractors instead.
 */
import DocumentsPage from './DocumentsPage';
import { HR_SCOPE } from './scope';

export default function HrDocumentsPage() {
  return <DocumentsPage scope={HR_SCOPE} />;
}

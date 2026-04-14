/**
 * GitHub Repository Details component.
 *
 * Re-uses the same repository details UI as Bitbucket since the SubResource
 * data structure is normalized across providers by the backend hooks.
 * The only differences are cosmetic labels which are handled via the
 * `providerLabel` prop.
 */
import React from "react";
import BitbucketRepositoryDetails from "../Bitbucket/BitbucketRepositoryDetails";

function GithubRepositoryDetails(props) {
  return <BitbucketRepositoryDetails {...props} providerLabel="GitHub" />;
}

export default GithubRepositoryDetails;

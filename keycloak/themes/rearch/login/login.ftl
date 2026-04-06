<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        <h1 class="rearch-title">
            <#if mode?? && mode = "register">Create Account<#else>Sign In</#if>
        </h1>
    <#elseif section = "form">
        <#if realm.password>
            <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                <div class="rearch-form-group">
                    <label for="username" class="rearch-label">
                        <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>Email</#if>
                    </label>
                    <input tabindex="1" id="username" class="rearch-input" name="username" value="${(login.username!'')}" type="text" autofocus autocomplete="off"
                           placeholder="you@example.com"
                           aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                    <#if messagesPerField.existsError('username','password')>
                        <span class="rearch-error" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                        </span>
                    </#if>
                </div>

                <div class="rearch-form-group">
                    <label for="password" class="rearch-label">Password</label>
                    <input tabindex="2" id="password" class="rearch-input" name="password" type="password" autocomplete="off"
                           placeholder="Your password"
                           aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                </div>

                <#if realm.rememberMe && !usernameHidden??>
                    <div class="rearch-form-options">
                        <div class="rearch-remember-me">
                            <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if>>
                            <label for="rememberMe">${msg("rememberMe")}</label>
                        </div>
                        <#if realm.resetPasswordAllowed>
                            <a tabindex="5" href="${url.loginResetCredentialsUrl}" class="rearch-link">${msg("doForgotPassword")}</a>
                        </#if>
                    </div>
                </#if>

                <input tabindex="4" class="rearch-button rearch-button-primary" name="login" id="kc-login" type="submit" value="Sign In" />
            </form>
        </#if>

        <#if realm.password && social.providers?? && social.providers?size gt 0>
            <div class="rearch-divider">
                <span>or</span>
            </div>
            <div class="rearch-social-providers">
                <#list social.providers as p>
                    <a id="social-${p.alias}" class="rearch-button rearch-button-social" href="${p.loginUrl}">
                        <#if p.iconClasses?has_content>
                            <i class="${p.iconClasses!}" aria-hidden="true"></i>
                        </#if>
                        <span>Sign in with ${p.displayName!}</span>
                    </a>
                </#list>
            </div>
        </#if>
    <#elseif section = "info">
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div class="rearch-registration-link">
                Don't have an account?
                <a tabindex="6" href="${url.registrationUrl}" class="rearch-link">Create one</a>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>

using Microsoft.Extensions.Configuration;

namespace TypeLab.Api.Tests;

/// <summary>
/// The content root is chosen before <c>UseElfSidecar</c> runs, so it must read
/// the switch the same way ELF.Modules.Hosting.Sidecar does: 1/0 or true/false,
/// any case, surrounding spaces ignored.
/// </summary>
public class SidecarSignalTests
{
    private static IConfiguration Config(string? enabled = null) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(enabled is null ? [] : [new("Elf:Hosting:Sidecar:Enabled", enabled)])
            .Build();

    [Theory]
    [InlineData("1")]
    [InlineData("true")]
    [InlineData("True")]
    [InlineData("TRUE")]
    [InlineData(" 1 ")]
    public void Environment_value_the_package_accepts_turns_it_on(string value) =>
        Assert.True(SidecarSignal.IsRequested(value, Config()));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("0")]
    [InlineData("false")]
    public void Environment_value_off_or_absent_leaves_it_off(string? value) =>
        Assert.False(SidecarSignal.IsRequested(value, Config()));

    [Theory]
    [InlineData("1")]
    [InlineData("true")]
    [InlineData(" True ")]
    public void Configuration_switch_turns_it_on(string value) =>
        Assert.True(SidecarSignal.IsRequested(null, Config(value)));

    [Fact]
    public void Configuration_switch_off_leaves_it_off() =>
        Assert.False(SidecarSignal.IsRequested(null, Config("0")));

    [Fact]
    public void Unreadable_value_leaves_it_off_for_the_package_to_reject() =>
        Assert.False(SidecarSignal.IsRequested("yes", Config("on")));
}
